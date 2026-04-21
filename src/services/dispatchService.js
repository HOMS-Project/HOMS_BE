/**
 * Vehicle & Staff Dispatch Service
 * - Select suitable vehicles based on payload capacity
 * - Assign drivers & helpers
 * - Check availability to prevent overlap
 * - Support dispatching single or multiple vehicles
 */

const mongoose = require('mongoose');
const DispatchAssignment = require('../models/DispatchAssignment');
const DispatchDecisionLog = require('../models/DispatchDecisionLog');
const ResourceScheduleView = require('../models/ResourceScheduleView');
const Invoice = require('../models/Invoice');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const RouteValidationService = require('./routeValidationService');
const AppError = require('../utils/appErrors');
const NotificationService = require('./notificationService');
const T = require('../utils/notificationTemplates');
const LogisticsEngine = require('./logisticsEngine');
const RequestTicket = require('../models/RequestTicket');
const turf = require('@turf/turf');

class DispatchService {
  /**
   * Determine delivery time based on pickup time, estimated duration and an optional buffer
   */
  calculateDeliveryTime({ pickupTime, estimatedDuration, buffer = 0 }) {
    if (!pickupTime) return null;
    const durationInMs = (estimatedDuration + buffer) * 60000;
    return new Date(new Date(pickupTime).getTime() + durationInMs);
  }

  /**
   * Check availability of resources for UI engine
   */
  async checkResourceAvailability(pickupTime, estimatedDuration = 480) {
    if (!pickupTime) return null;

    const targetStart = new Date(pickupTime).getTime();
    const targetEnd = targetStart + (estimatedDuration * 60000);
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    const driversList = await User.find({ role: 'driver', status: 'Active' })
      .select('-password -otpResetPassword -otpResetExpires').lean();

    // Fallback: If your system uses 'driver' for both or separates them:
    let staffList = await User.find({ role: 'staff', status: 'Active' })
      .select('-password -otpResetPassword -otpResetExpires').lean();
    if (staffList.length === 0) {
      // In some systems, 'driver' role acts as both driver and staff. Find all.
      staffList = await User.find({ role: 'driver', status: 'Active' })
        .select('-password -otpResetPassword -otpResetExpires').lean();
    }

    const vehiclesList = await Vehicle.find({ status: 'Available', isActive: true }).lean();

    const assignments = await DispatchAssignment.find({
      status: { $in: ['PENDING', 'ASSIGNED', 'CONFIRMED', 'IN_PROGRESS'] }
    });
    const activeTasks = assignments.flatMap(da => da.assignments);

    const mapAvailability = (item, isVehicle = false) => {
      let status = 'AVAILABLE';
      let conflictDetails = null;

      for (const task of activeTasks) {
        if (!task.pickupTime || !task.deliveryTime) continue;

        const taskStart = new Date(task.pickupTime).getTime();
        const taskEnd = new Date(task.deliveryTime).getTime();

        const isAssigned = isVehicle
          ? task.vehicleId?.toString() === item._id.toString()
          : (task.driverIds?.some(id => id.toString() === item._id.toString()) ||
            task.staffIds?.some(id => id.toString() === item._id.toString()));

        if (isAssigned) {
          if (taskStart < targetEnd && taskEnd > targetStart) {
            status = 'UNAVAILABLE';
            conflictDetails = { type: 'OVERLAP', taskStart, taskEnd };
            break; // Severe overlap, stop checking
          }
          if (taskStart < targetEnd + TWO_HOURS_MS && taskEnd + TWO_HOURS_MS > targetStart) {
            status = 'TIGHT'; // Might be tight, but keep checking in case another task makes it UNAVAILABLE
            conflictDetails = { type: 'TIGHT', taskStart, taskEnd };
          }
        }
      }
      return { ...item, availabilityStatus: status, conflictDetails };
    };

    return {
      drivers: driversList.map(d => mapAvailability(d, false)),
      staff: staffList.map(s => mapAvailability(s, false)),
      vehicles: vehiclesList.map(v => mapAvailability(v, true))
    };
  }

  /**
   * Phase 2: Penalty-Based Heuristic Routing
   * Suggests available resources fulfilling limits via optimization scoring (70% Efficiency, 30% Fairness).
   */
  async suggestResources(pickupTime, estimatedDuration, parameters = {}) {
    const { requiredLeaders = 0, requiredDrivers = 0, requiredHelpers = 0, pickupLocation } = parameters;

    // Evaluate constraint limits and tight schedules
    const availability = await this.checkResourceAvailability(pickupTime, estimatedDuration);

    // Load snapshot of cached workload for fairness scoring
    const targetDate = new Date(pickupTime);
    targetDate.setHours(0, 0, 0, 0);
    const scheduleViews = await ResourceScheduleView.find({ date: targetDate }).lean();
    const workloadMap = new Map(scheduleViews.map(view => [view.resourceId.toString(), view.workloadCount]));

    const pickupPoint = (pickupLocation && pickupLocation.coordinates && pickupLocation.coordinates.length === 2)
      ? turf.point(pickupLocation.coordinates)
      : null;

    const scoreResource = (resource) => {
      let breakdown = {
        resourceId: resource._id,
        resourceType: 'USER',
        baseScore: 100,
        penalty: 0,
        tags: [],
        finalScore: 0
      };

      // 1. Efficiency Penalty (70% of base)
      let efficiencyScore = 70;
      if (resource.availabilityStatus === 'TIGHT') {
        efficiencyScore -= 30; // Severe penalty for tight back-to-back schedules
        breakdown.tags.push('tight_schedule');
      }

      // Proximity Scoring
      if (!resource.currentLocation?.coordinates) {
        efficiencyScore -= 10;
        breakdown.tags.push('far_from_depot_or_unknown');
      } else if (pickupPoint) {
        const resourcePoint = turf.point(resource.currentLocation.coordinates);
        const distanceKm = turf.distance(pickupPoint, resourcePoint, { units: 'kilometers' });

        // Example penalty: 1 penalty point per km, max 20
        const distancePenalty = Math.min(Math.round(distanceKm), 20);
        efficiencyScore -= distancePenalty;
        breakdown.tags.push(`distance_${distanceKm.toFixed(1)}km`);
      }

      // 2. Fairness Penalty (30% of base) -> Balanced workload distribution
      let fairnessScore = 30;
      const currentWorkload = workloadMap.get(resource._id.toString()) || 0;
      const MULTIPLIER = 10; // e.g. 3 jobs -> 30 penalty = 0 fairness
      const workloadPenalty = Math.min(currentWorkload * MULTIPLIER, 30);
      fairnessScore -= workloadPenalty;

      if (currentWorkload > 0) {
        breakdown.tags.push(`workload_count_${currentWorkload}`);
      }

      breakdown.penalty = (70 - efficiencyScore) + (30 - fairnessScore);
      breakdown.finalScore = efficiencyScore + fairnessScore;

      return { data: resource, breakdown };
    };

    // Filter absolute constraints ('UNAVAILABLE'), then score the rest
    const viableDrivers = availability.drivers
      .filter(d => d.availabilityStatus !== 'UNAVAILABLE')
      .map(scoreResource)
      .sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);

    const viableStaff = availability.staff
      .filter(s => s.availabilityStatus !== 'UNAVAILABLE')
      .map(scoreResource)
      .sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);

    let leader = null;
    let helpers = [];
    let suggestedDrivers = [];

    let viableDriversPool = [...viableDrivers];

    if (requiredLeaders > 0 && viableDriversPool.length > 0) {
      leader = viableDriversPool.shift();
    }

    suggestedDrivers = viableDriversPool.slice(0, requiredDrivers);

    // Staff pool filtering out already selected valid drivers
    let remainingStaff = viableStaff.filter(s =>
      !suggestedDrivers.some(d => d.data._id.toString() === s.data._id.toString()) &&
      (!leader || leader.data._id.toString() !== s.data._id.toString())
    );

    helpers = remainingStaff.slice(0, requiredHelpers);

    const missingDrivers = Math.max(0, requiredDrivers - suggestedDrivers.length);
    const missingLeaders = Math.max(0, requiredLeaders - (leader ? 1 : 0));
    const missingHelpers = Math.max(0, requiredHelpers - helpers.length);

    // We can force proceed if we have at least minimum core drivers or a leader
    const canForce = (suggestedDrivers.length > 0 || leader !== null);

    return {
      suggestedTeam: {
        leaderId: leader ? leader.data._id : null,
        driverIds: suggestedDrivers.map(d => d.data._id),
        staffIds: helpers.map(h => h.data._id)
      },
      rawTeam: {
        leader: leader ? leader.data : null,
        drivers: suggestedDrivers.map(d => d.data),
        helpers: helpers.map(h => h.data)
      },
      scoreBreakdowns: [
        ...suggestedDrivers.map(d => d.breakdown),
        ...(leader ? [leader.breakdown] : []),
        ...helpers.map(h => h.breakdown)
      ],
      shortages: {
        required: { leader: requiredLeaders, drivers: requiredDrivers, helpers: requiredHelpers },
        available: { leader: leader ? 1 : 0, drivers: suggestedDrivers.length, helpers: helpers.length },
        missing: { leader: missingLeaders, drivers: missingDrivers, helpers: missingHelpers }
      },
      canForce
    };
  }

  /**
   * Smart Time Slot Scanner
   * Scans boundaries of existing tasks to find the next viable free window.
   */
  async suggestTimeSlots(pickupTime, estimatedDuration, rules = {}) {
    if (!pickupTime) return [];

    const slots = [];
    const baseTime = new Date(pickupTime).getTime();

    const availability = await this.checkResourceAvailability(pickupTime, estimatedDuration);
    let conflictEnds = [];

    const collectConflicts = (list) => {
      list.forEach(item => {
        if (item.conflictDetails && item.conflictDetails.taskEnd) {
          // Add 30 mins buffer to end of conflicting shift
          conflictEnds.push(item.conflictDetails.taskEnd + 30 * 60000);
        }
      });
    };

    collectConflicts(availability.drivers);
    collectConflicts(availability.staff);
    collectConflicts(availability.vehicles);

    conflictEnds = [...new Set(conflictEnds)].sort((a, b) => a - b);

    const candidates = [...conflictEnds];
    const hourMs = 60 * 60 * 1000;

    // Expand fallback: Check up to 12 hours ahead in 1hr increments
    for (let i = 1; i <= 12; i++) {
      candidates.push(baseTime + i * hourMs);
    }

    // Only test future times compared to baseTime
    const futureCandidates = [...new Set(candidates.filter(c => c > baseTime))].sort((a, b) => a - b);

    for (const time of futureCandidates) {
      const avail = await this.checkResourceAvailability(new Date(time), estimatedDuration);
      const availDrivers = avail.drivers.filter(d => d.availabilityStatus === 'AVAILABLE');
      const availStaff = avail.staff.filter(s => s.availabilityStatus === 'AVAILABLE');
      const availVehicles = avail.vehicles.filter(v => v.availabilityStatus === 'AVAILABLE');

      const neededLeader = rules.requiredLeaders || 0;
      const neededDrivers = rules.requiredDrivers || 0;
      const neededHelpers = rules.requiredHelpers || 0;

      // Note: In this system, drivers act as both leader and secondary drivers
      const totalNeededDrivers = neededLeader + neededDrivers;

      // Slot is viable only if ALL resource limits are met
      if (availDrivers.length >= totalNeededDrivers &&
        availStaff.length >= neededHelpers &&
        availVehicles.length > 0) {
        slots.push(new Date(time).toISOString());
      }

      if (slots.length >= 3) break;
    }

    return slots;
  }

  extractUniqueIdsFromAssignments(assignments, fieldName) {
    const idSet = new Set();
    (assignments || []).forEach((item) => {
      const ids = Array.isArray(item?.[fieldName]) ? item[fieldName] : [];
      ids.forEach((id) => {
        if (id) idSet.add(id.toString());
      });
    });
    return Array.from(idSet);
  }

  async notifyDriversOnAssignment(context) {
    const candidateIds = Array.isArray(context?.driverIds) ? context.driverIds : [];
    if (candidateIds.length === 0) return;

    // Some dispatcher flows may place a driver account into staffIds.
    // We notify by role=driver to ensure real drivers always receive assignment alerts.
    const driverUsers = await User.find({
      _id: { $in: candidateIds },
      role: 'driver'
    })
      .select('_id')
      .lean();

    const driverIds = [...new Set(driverUsers.map((u) => u._id.toString()))];
    if (driverIds.length === 0) return;

    const message = context?.requestCode
      ? `Bạn vừa được phân công yêu cầu ${context.requestCode}. Vui lòng kiểm tra chi tiết để thực hiện.`
      : 'Bạn vừa được phân công một yêu cầu mới. Vui lòng kiểm tra chi tiết để thực hiện.';

    const jobs = driverIds.map((driverId) =>
      NotificationService.createNotification({
        userId: driverId,
        ...T.DRIVER_NEW_ASSIGNMENT({ requestCode: context?.requestCode }),
        ticketId: context?.ticketId || undefined
      })
    );

    const results = await Promise.allSettled(jobs);
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.error(`[BE] notifyDriversOnAssignment: ${failed.length} notifications failed`);
    }
  }

  /**
   * Calculate required vehicles to fulfill load capacity
   */
  async calculateVehicleNeeds(totalWeight, totalVolume) {
    const VEHICLE_SPECS = {
      '500KG': { maxWeight: 500, maxVolume: 5 },
      '1TON': { maxWeight: 1000, maxVolume: 10 },
      '1.5TON': { maxWeight: 1500, maxVolume: 15 },
      '2TON': { maxWeight: 2000, maxVolume: 20 }
    };
    const vehicleTypes = ['500KG', '1TON', '1.5TON', '2TON'];

    // Step 1: find the smallest single vehicle that can carry the entire load
    for (const vehicleType of vehicleTypes) {
      const spec = VEHICLE_SPECS[vehicleType];
      if (totalWeight <= spec.maxWeight && totalVolume <= spec.maxVolume) {
        return [{ vehicleType, count: 1 }];
      }
    }

    // Step 2: load exceeds even the largest vehicle — use multiples of 2TON
    const largestSpec = VEHICLE_SPECS['2TON'];
    const count = Math.ceil(Math.max(
      totalWeight / largestSpec.maxWeight,
      totalVolume / largestSpec.maxVolume
    ));
    return [{ vehicleType: '2TON', count }];
  }

  /**
   * Find available active vehicles matching requested type
   */
  async findAvailableVehicles(vehicleType, count = 1) {
    try {
      const vehicles = await Vehicle.find({
        vehicleType,
        status: 'Available',
        isActive: true
      }).limit(count);

      if (vehicles.length < count) {
        throw new AppError(
          `Not enough available ${vehicleType} vehicles. Need: ${count}, Available: ${vehicles.length}`,
          400
        );
      }

      return vehicles;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Assign drivers and helpers to a vehicle, support leaderId while preventing double-booking overlaps
   */
  async assignStaff(options) {
    try {
      const {
        vehicleId,
        driverIds = [],
        leaderId = null,
        staffIds = [],
        pickupTime = null,
        deliveryTime = null,
        excludeAssignmentId = null,
        allowOverflow = false,
        session = null
      } = options;

      const vehicle = await Vehicle.findById(vehicleId).session(session);
      if (!vehicle) throw new AppError('Vehicle not found', 404);

      let allDriverIds = [...driverIds];
      if (leaderId && !allDriverIds.includes(leaderId)) {
        allDriverIds.push(leaderId);
      }

      const totalStaff = allDriverIds.length + staffIds.length;
      if (vehicle.maxStaff && totalStaff > vehicle.maxStaff) {
        if (!allowOverflow) {
          throw new AppError(`Cannot assign ${totalStaff} staff. Vehicle ${vehicle.vehicleType} max capacity is ${vehicle.maxStaff}.`, 400);
        }
      }

      // Validate user existence
      const drivers = await User.find({ _id: { $in: allDriverIds } }).session(session);
      const staff = await User.find({ _id: { $in: staffIds } }).session(session);

      if (drivers.length !== allDriverIds.length) {
        throw new AppError('Some drivers not found', 404);
      }

      if (staff.length !== staffIds.length) {
        throw new AppError('Some staff not found', 404);
      }

      // ==== PREVENT OVERLAPPING SHIFTS (DOUBLE-BOOKING) ATOMICALLY ====
      const targetStaffIds = [...new Set([leaderId, ...driverIds, ...staffIds].filter(Boolean))];

      if (targetStaffIds.length > 0 && pickupTime && deliveryTime) {
        const query = {
          status: { $in: ['PENDING', 'ASSIGNED', 'CONFIRMED', 'IN_PROGRESS'] },
          assignments: {
            $elemMatch: {
              $or: [
                { driverIds: { $in: targetStaffIds } },
                { staffIds: { $in: targetStaffIds } }
              ],
              pickupTime: { $lt: deliveryTime },
              deliveryTime: { $gt: pickupTime }
            }
          }
        };

        if (excludeAssignmentId) {
          query._id = { $ne: excludeAssignmentId };
        }

        // Phase 1: Atomic Concurrency Lock. 
        // We use findOne inside a session transaction with proper ranges to block double-booking.
        const conflictingAssignment = await DispatchAssignment.findOne(query).session(session);

        if (conflictingAssignment) {
          // If we find just ONE overlap, immediately throw `RESOURCE_CONFLICT` to halt the transaction.
          throw new AppError('RESOURCE_CONFLICT', 400);
        }
      }

      let roles = [];
      if (leaderId) roles.push('TEAM_LEADER');
      if (driverIds && driverIds.length > 0) roles.push('DRIVER');
      if (staffIds && staffIds.length > 0) roles.push('HELPER');

      return {
        vehicleId,
        driverIds: allDriverIds,
        staffIds,
        staffCount: staffIds.length + allDriverIds.length,
        staffRole: roles.length > 0 ? roles : ['HELPER']
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Allocate fleet (vehicles) for a dispatch assignment
   * Determines and reserves vehicles based on load capacity
   */
  async allocateFleet(invoice, dispatchData, session) {
    try {
      console.log(`[BE] allocateFleet: Calculating vehicle needs for weight: ${dispatchData.totalWeight}, volume: ${dispatchData.totalVolume}`);
      const ticket = invoice.requestTicketId;

      // Determine necessary vehicles OR use manual override
      let vehicleNeeds;
      if (dispatchData.vehicles && dispatchData.vehicles.length > 0) {
        vehicleNeeds = dispatchData.vehicles.map(v => ({ vehicleType: v.vehicleType, count: parseInt(v.count) }));
      } else if (dispatchData.vehicleType && dispatchData.vehicleCount) {
        vehicleNeeds = [{ vehicleType: dispatchData.vehicleType, count: parseInt(dispatchData.vehicleCount) }];
      } else {
        vehicleNeeds = await this.calculateVehicleNeeds(
          dispatchData.totalWeight,
          dispatchData.totalVolume
        );
      }

      const fleetAssignments = [];
      let totalCapacity = 0;

      // Calculate total number of vehicles across all needs to split load per vehicle for validation
      const totalVehicleCount = vehicleNeeds.reduce((sum, n) => sum + (parseInt(n.count) || 1), 0);

      // Assign vehicles
      for (const need of vehicleNeeds) {
        // Temporarily ignoring session for findAvailableVehicles since we need to modify its arguments. We will just pass session to assignStaff where conflict checking happens.
        const vehicles = await this.findAvailableVehicles(need.vehicleType, need.count);

        for (const vehicle of vehicles) {
          const assignedPickupTime = dispatchData.dispatchTime ? new Date(dispatchData.dispatchTime) : (invoice.scheduledTime || ticket?.scheduledTime || new Date());
          const estimatedDuration = dispatchData.estimatedDuration || 480;
          const assignedDeliveryTime = this.calculateDeliveryTime({
            pickupTime: assignedPickupTime,
            estimatedDuration: estimatedDuration
          });

          // When multiple vehicles are dispatched, split weight/volume evenly across all of them
          // so capacity validation is per-vehicle, not against the full load.
          const perVehicleWeight = totalVehicleCount > 1
            ? Math.ceil((dispatchData.totalWeight || 0) / totalVehicleCount)
            : (dispatchData.totalWeight || 0);
          const perVehicleVolume = totalVehicleCount > 1
            ? ((dispatchData.totalVolume || 0) / totalVehicleCount)
            : (dispatchData.totalVolume || 0);

          // Validate route restrictions
          const targetRouteId = dispatchData.routeId || invoice.routeId;
          const validation = await RouteValidationService.validateRoute(
            targetRouteId,
            {
              vehicleType: need.vehicleType,
              totalWeight: perVehicleWeight,
              totalVolume: perVehicleVolume,
              pickupTime: assignedPickupTime,
              deliveryTime: assignedDeliveryTime,
              pickupAddress: ticket?.pickup?.address || '',
              deliveryAddress: ticket?.delivery?.address || ''
            }
          );

          if (!validation.isValid) {
            throw new AppError(
              `Route validation failed: ${validation.violations.join(', ')}`,
              400
            );
          }

          fleetAssignments.push({
            vehicle,
            vehicleType: need.vehicleType,
            pickupTime: assignedPickupTime,
            deliveryTime: assignedDeliveryTime,
            estimatedDuration: estimatedDuration,
            targetRouteId: targetRouteId,
            validation: validation
          });

          totalCapacity += this.getVehicleCapacity(need.vehicleType);
        }
      }

      console.log(`[BE] allocateFleet: Assigned ${fleetAssignments.length} vehicles with total capacity ${totalCapacity}`);
      return { fleetAssignments, totalCapacity };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Allocate personnel (drivers and helpers) to vehicles
   * Assigns staff and performs availability conflict checks
   */
  async allocatePersonnel(fleetAssignments, dispatchData, session) {
    try {
      console.log(`[BE] allocatePersonnel: Assigning personnel for ${fleetAssignments.length} vehicles (Leader: ${dispatchData.leaderId}, Drivers: ${dispatchData.driverIds?.length || 0}, Helpers: ${dispatchData.staffIds?.length || 0})`);
      const assignmentRecords = [];
      let totalStaff = 0;

      // Make a copy of lists to distribute safely
      const availableDrivers = [...(dispatchData.driverIds || [])];
      const availableStaff = [...(dispatchData.staffIds || [])];
      let leaderIdToAssign = dispatchData.leaderId;

      // Pre-validation: Ensure we have enough drivers or a leader to cover vehicles
      const potentialDriverCount = availableDrivers.length + (dispatchData.leaderId ? 1 : 0);
      if (potentialDriverCount < fleetAssignments.length) {
        throw new AppError(`Not enough drivers assigned. Allocated ${fleetAssignments.length} vehicles but only received ${potentialDriverCount} potential drivers (including leader). A vehicle cannot be dispatched without a driver.`, 400);
      }

      for (let i = 0; i < fleetAssignments.length; i++) {
        const fleetItem = fleetAssignments[i];
        const isLastVehicle = i === fleetAssignments.length - 1;

        const {
          vehicle,
          vehicleType,
          pickupTime,
          deliveryTime,
          estimatedDuration,
          targetRouteId,
          validation
        } = fleetItem;

        // Determine capacity
        const maxCapacity = vehicle.maxStaff || 2;
        let currentCapacity = 0;

        const vehicleDrivers = [];
        const vehicleStaff = [];
        let vehicleLeader = null;

        // 1. Assign exactly ONE primary driver to the vehicle (Leader takes priority)
        let hasPrimaryDriver = false;
        if (leaderIdToAssign && currentCapacity < maxCapacity) {
          vehicleLeader = leaderIdToAssign;
          leaderIdToAssign = null;
          currentCapacity++;
          hasPrimaryDriver = true;
        } else if (availableDrivers.length > 0 && currentCapacity < maxCapacity) {
          vehicleDrivers.push(availableDrivers.shift());
          currentCapacity++;
          hasPrimaryDriver = true;
        }

        // 2. Fill remaining capacity with helpers
        while (availableStaff.length > 0 && currentCapacity < maxCapacity) {
          vehicleStaff.push(availableStaff.shift());
          currentCapacity++;
        }

        // 3. If there are still empty seats, and we have surplus drivers (not needed for remaining vehicles), allow them to sit
        const remainingVehiclesCount = fleetAssignments.length - 1 - i;
        while (availableDrivers.length > remainingVehiclesCount && currentCapacity < maxCapacity) {
          vehicleDrivers.push(availableDrivers.shift());
          currentCapacity++;
        }

        // 4. Attach any remaining overflow staff to the last vehicle (they will travel via personal vehicles)
        if (isLastVehicle) {
          if (leaderIdToAssign) {
            if (!vehicleLeader) vehicleLeader = leaderIdToAssign;
            else vehicleStaff.push(leaderIdToAssign);
            leaderIdToAssign = null;
          }
          while (availableDrivers.length > 0) vehicleDrivers.push(availableDrivers.shift());
          while (availableStaff.length > 0) vehicleStaff.push(availableStaff.shift());
        }

        // Process assignment only if there are people assigned to it
        if (vehicleDrivers.length > 0 || vehicleStaff.length > 0 || vehicleLeader) {
          const staffAssignment = await this.assignStaff({
            vehicleId: vehicle._id,
            leaderId: vehicleLeader,
            driverIds: vehicleDrivers,
            staffIds: vehicleStaff,
            pickupTime: pickupTime,
            deliveryTime: deliveryTime,
            allowOverflow: isLastVehicle,
            session: session
          });

          const assignmentRecord = {
            vehicleId: vehicle._id,
            driverIds: staffAssignment.driverIds,
            staffIds: staffAssignment.staffIds,
            staffCount: staffAssignment.staffCount,
            staffRole: staffAssignment.staffRole,
            pickupTime: pickupTime,
            deliveryTime: deliveryTime,
            estimatedDuration: estimatedDuration,
            loadWeight: dispatchData.totalWeight,
            loadVolume: dispatchData.totalVolume,
            capacityStatus: this.determineCapacityStatus(
              vehicleType,
              dispatchData.totalWeight
            ),
            routeId: targetRouteId,
            routeValidation: validation,
            status: 'PENDING',
            assignedAt: new Date()
          };

          assignmentRecords.push(assignmentRecord);
          totalStaff += staffAssignment.staffCount;
        } else {
          // Empty vehicle, no staff capacity available, throw error or log warning
          console.warn(`[BE] allocatePersonnel: Vehicle ${vehicle._id} has no staff assigned due to lack of personnel.`);
        }
      }

      // Check overflow
      const overflowCount = availableDrivers.length + availableStaff.length + (leaderIdToAssign ? 1 : 0);
      if (overflowCount > 0) {
        // This should normally be 0 now since the last vehicle absorbs the overflow
        throw new AppError(`Not enough seats in dispatched vehicles. ${overflowCount} staff members are left without seats. Please assign a passenger vehicle or remove staff.`, 400);
      }

      console.log(`[BE] allocatePersonnel: Assigned total of ${totalStaff} staff members.`);
      return { assignmentRecords, totalStaff };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new dispatch assignment for an invoice
   * Orchestrates fleet and personnel allocation
   */
  async createDispatchAssignment(invoiceId, dispatchData) {
    console.log(`[BE] createDispatchAssignment initiated for invoice: ${invoiceId}`, dispatchData);
    const startTime = Date.now();

    const session = await mongoose.startSession();
    let resultAssignment;
    let driverNotificationContext = null;

    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findById(invoiceId)
          .populate({
            path: 'requestTicketId',
            select: 'code pickup delivery scheduledTime customerId dispatcherId surveyDataId items',
            populate: { path: 'surveyDataId' }
          })
          .session(session);

        if (!invoice) {
          throw new AppError('Invoice not found', 404);
        }

        let assignment = await DispatchAssignment.findOne({ invoiceId }).session(session);
        if (!assignment) {
          assignment = new DispatchAssignment({ invoiceId });
          console.log(`[BE] createDispatchAssignment: Creating new DispatchAssignment document for invoice ${invoiceId}`);
        } else {
          console.log(`[BE] createDispatchAssignment: Reusing existing DispatchAssignment document for invoice ${invoiceId} (ID: ${assignment._id})`);
        }

        const surveyData = invoice.requestTicketId?.surveyDataId || {};
        let idealStaffCount = surveyData.suggestedStaffCount || 2;

        // Step 1: Allocate fleet (vehicles)
        console.log(`[BE] createDispatchAssignment: Step 1 - Allocating Fleet...`);
        const { fleetAssignments, totalCapacity } = await this.allocateFleet(invoice, dispatchData, session);

        // Step 2: Allocate personnel (drivers and helpers)
        console.log(`[BE] createDispatchAssignment: Step 2 - Allocating Personnel...`);
        let assignmentRecords, totalStaff;
        try {
          const allocResult = await this.allocatePersonnel(fleetAssignments, dispatchData, session);
          assignmentRecords = allocResult.assignmentRecords;
          totalStaff = allocResult.totalStaff;

          if (totalStaff < idealStaffCount) {
            throw new AppError('UNDERSTAFFED_ASSIGNMENT', 400);
          }
        } catch (error) {
          if ((error.message === 'RESOURCE_CONFLICT' || error.message === 'Staff availability conflict' || error.message === 'UNDERSTAFFED_ASSIGNMENT') && dispatchData.forceProceed !== true) {
            const assignedPickupTime = dispatchData.dispatchTime ? new Date(dispatchData.dispatchTime) : (invoice.scheduledTime || invoice.requestTicketId?.scheduledTime || new Date());
            const duration = dispatchData.estimatedDuration || 480;

            const vehicleCount = fleetAssignments ? fleetAssignments.length : 1;
            const rules = {
              requiredDrivers: vehicleCount - 1,
              requiredHelpers: Math.max(0, idealStaffCount - vehicleCount),
              requiredLeaders: 1,
              pickupLocation: invoice.requestTicketId?.pickup || null
            };

            const suggestion = await this.suggestResources(assignedPickupTime, duration, rules);
            const nextSlots = await this.suggestTimeSlots(assignedPickupTime, duration, rules);

            const err = new AppError('INSUFFICIENT_RESOURCES', 400);
            err.data = {
              requestedTime: assignedPickupTime,
              duration,
              shortages: suggestion.shortages,
              suggestedTeam: suggestion.suggestedTeam,
              nextAvailableSlots: nextSlots,
              canForce: suggestion.canForce
            };
            throw err;
          }
          throw error;
        }

        // Step 3: Update assignment document
        console.log(`[BE] createDispatchAssignment: Step 3 - Saving assignment state...`);
        assignment.assignments = assignmentRecords;
        assignment.totalVehicles = assignmentRecords.length;
        assignment.totalStaff = totalStaff;
        assignment.totalCapacity = totalCapacity;
        assignment.status = 'ASSIGNED';

        const explicitDriverIds = this.extractUniqueIdsFromAssignments(assignmentRecords, 'driverIds');
        const roleCandidateIds = this.extractUniqueIdsFromAssignments(assignmentRecords, 'staffIds');
        const driverIds = [...new Set([...explicitDriverIds, ...roleCandidateIds])];
        const requestCode = invoice.requestTicketId?.code || invoice.code || null;
        driverNotificationContext = {
          driverIds,
          ticketId: invoice.requestTicketId?._id || invoice.requestTicketId || null,
          requestCode
        };

        if (dispatchData.forceProceed === true) {
          assignment.understaffed = true;

          if (invoice.requestTicketId?.customerId) {
            const ticket = invoice.requestTicketId;
            try {
              await NotificationService.createNotification({
                userId: ticket.customerId,
                ...T.DISPATCH_UNDERSTAFFED(),
                ticketId: ticket._id
              });
            } catch (notifErr) {
              console.error('[BE] Warning: Failed to send understaffed notification', notifErr);
            }
          }
        }

        // Phase 3: Materialized View (Interim Cache) Update
        for (const record of assignmentRecords) {
          const targetDate = new Date(record.pickupTime);
          targetDate.setHours(0, 0, 0, 0);

          // Build a bulk operation for this record's users
          const participants = [
            ...record.driverIds.map(id => ({ id, type: 'USER' })),
            ...record.staffIds.map(id => ({ id, type: 'USER' })),
            { id: record.vehicleId, type: 'VEHICLE' }
          ];

          for (const participant of participants) {
            if (!participant.id) continue;
            await ResourceScheduleView.findOneAndUpdate(
              { resourceId: participant.id, date: targetDate },
              {
                $set: { resourceType: participant.type },
                $max: { nextAvailableTime: record.deliveryTime },
                $inc: { workloadCount: 1 }
              },
              { upsert: true, session, new: true }
            );
          }
        }

        await assignment.save({ session });

        // Step 4: Update invoice details
        invoice.dispatchAssignmentId = assignment._id;
        if (dispatchData.routeId) {
          invoice.routeId = dispatchData.routeId;
        }

        // ── Scenario B: Time change → propose to customer instead of silently updating ──
        let isTimeChanged = false;
        let newTimeFormatted = '';

        if (dispatchData.dispatchTime) {
          const newTime = new Date(dispatchData.dispatchTime);
          const originalTime = invoice.requestTicketId?.scheduledTime || invoice.scheduledTime;

          if (originalTime && Math.abs(originalTime.getTime() - newTime.getTime()) > 60000 && invoice.requestTicketId?.customerId) {
            // Time differs by more than 1 min — propose, don't update yet
            isTimeChanged = true;
            const dayjs = require('dayjs');
            newTimeFormatted = dayjs(newTime).format('HH:mm DD/MM/YYYY');

            invoice.proposedDispatchTime = newTime;
            invoice.rescheduleStatus = 'PENDING_APPROVAL';
            // scheduledTime remains unchanged until customer approves
          } else {
            // Same time or negligible diff → update directly
            invoice.scheduledTime = newTime;
          }
        }

        invoice.status = 'ASSIGNED';
        await invoice.save({ session });

        // ── Scenario A: Dispatch success notification ───────────────────────────────────
        try {
          const ticket = invoice.requestTicketId;
          let ioInstance = null;
          try { const { getIo } = require('../utils/socket'); ioInstance = getIo(); } catch (_) { /* no-op */ }
          const dayjs = require('dayjs');
          await NotificationService.createNotification({
            userId: ticket.customerId,
            ...T.DISPATCH_SUCCESS({
              ticketCode: ticket?.code || 'Không xác định',
              dispatchTime: dayjs(invoice.proposedDispatchTime || invoice.scheduledTime).format('HH:mm DD/MM/YYYY'),
              vehicleCount: fleetAssignments ? fleetAssignments.length : 1
            }),
            ticketId: ticket._id
          }, ioInstance);
        } catch (notifErr) {
          console.error('[BE] Warning: Failed to send dispatch success notification', notifErr);
        }

        // ── Scenario B: Notify customer of proposed reschedule ─────────────────────────
        if (isTimeChanged) {
          try {
            const ticket = invoice.requestTicketId;
            let ioInstance = null;
            try { const { getIo } = require('../utils/socket'); ioInstance = getIo(); } catch (_) { /* no-op */ }
            await NotificationService.createNotification({
              userId: ticket.customerId,
              ...T.DISPATCH_RESCHEDULE_PROPOSED({
                ticketCode: ticket?.code || 'Không xác định',
                proposedTime: newTimeFormatted
              }),
              ticketId: ticket._id
            }, ioInstance);
          } catch (notifErr) {
            console.error('[BE] Warning: Failed to send reschedule proposal notification', notifErr);
          }
        }

        // Phase 2: Log the decision & Run Heuristic Scoring
        const logDurationMs = dispatchData.estimatedDuration ? dispatchData.estimatedDuration * 60000 : 480 * 60000;
        const requestedTime = dispatchData.dispatchTime || invoice.scheduledTime;

        // Calculate the "Optimal" ML recommendation (even if manual override occurred)
        const vehicleCount = fleetAssignments ? fleetAssignments.length : 1;
        const optimalSuggestion = await this.suggestResources(requestedTime, logDurationMs / 60000, {
          requiredDrivers: vehicleCount - 1,
          requiredHelpers: Math.max(0, idealStaffCount - vehicleCount),
          requiredLeaders: 1,
          pickupLocation: invoice.requestTicketId?.pickup || null
        });

        const decisionLog = new DispatchDecisionLog({
          invoiceId: invoice._id,
          transactionId: new mongoose.Types.ObjectId().toString(),
          algorithmVersion: 'v2_heuristic_penalty',
          computationTimeMs: Date.now() - startTime,
          parameters: {
            requestedTime: requestedTime,
            durationMs: logDurationMs,
            requiredDrivers: dispatchData.driverIds?.length || 1,
            requiredHelpers: dispatchData.staffIds?.length || 1,
            requiredVehicles: 1,
            totalWeight: dispatchData.totalWeight || 0,
            totalVolume: dispatchData.totalVolume || 0
          },
          forceProceed: dispatchData.forceProceed || false,
          scoreBreakdown: optimalSuggestion.scoreBreakdowns,
          suggestedOutcome: {
            teams: [{
              driverIds: optimalSuggestion.suggestedTeam.driverIds,
              staffIds: optimalSuggestion.suggestedTeam.staffIds
            }],
            isUnderstaffedFallback: assignment.understaffed || false
          }
        });
        await decisionLog.save({ session });

        resultAssignment = assignment;
      });

      try {
        await this.notifyDriversOnAssignment(driverNotificationContext);
      } catch (notificationErr) {
        // Driver notification is best-effort and must not block dispatch flow.
        console.error('[BE] createDispatchAssignment: Driver notification failed', notificationErr);
      }

      return resultAssignment;
    } catch (error) {
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Confirm the dispatch assignment
   */
  async confirmDispatchAssignment(assignmentId) {
    try {
      const assignment = await DispatchAssignment.findById(assignmentId);
      if (!assignment) {
        throw new AppError('Assignment not found', 404);
      }

      // Mark all assignment records as CONFIRMED
      assignment.assignments.forEach(a => {
        a.status = 'CONFIRMED';
        a.confirmedAt = new Date();
      });

      assignment.status = 'CONFIRMED';
      await assignment.save();

      return assignment;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Determine capacity status (Underutilized/Optimal/Full/Overload)
   */
  determineCapacityStatus(vehicleType, weight) {
    const VEHICLE_SPECS = {
      '500KG': { maxWeight: 500 },
      '1TON': { maxWeight: 1000 },
      '1.5TON': { maxWeight: 1500 },
      '2TON': { maxWeight: 2000 }
    };

    const maxWeight = VEHICLE_SPECS[vehicleType]?.maxWeight || 1000;
    const utilization = (weight / maxWeight) * 100;

    if (utilization < 30) return 'UNDERUTILIZED';
    if (utilization <= 85) return 'OPTIMAL';
    if (utilization <= 100) return 'FULL';
    return 'OVERLOAD';
  }

  /**
   * Get maximum load capacity of a specific vehicle type
   */
  getVehicleCapacity(vehicleType) {
    const VEHICLE_SPECS = {
      '500KG': 500,
      '1TON': 1000,
      '1.5TON': 1500,
      '2TON': 2000
    };
    return VEHICLE_SPECS[vehicleType] || 0;
  }

  /**
   * Update or modify existing dispatch assignment
   */
  async updateDispatchAssignment(assignmentId, updateData) {
    try {
      const assignment = await DispatchAssignment.findById(assignmentId);
      if (!assignment) {
        throw new AppError('Assignment not found', 404);
      }

      // Allow changes only if the assignment is still in DRAFT
      if (assignment.status !== 'DRAFT') {
        throw new AppError('Cannot modify confirmed assignment', 400);
      }

      // Update data payload
      if (updateData.assignments) {
        assignment.assignments = updateData.assignments;
      }

      await assignment.save();
      return assignment;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieve dispatch assignment by invoice ID
   */
  async getAssignmentByInvoice(invoiceId) {
    return DispatchAssignment.findOne({ invoiceId })
      .populate('assignments.vehicleId')
      .populate('assignments.driverIds')
      .populate('assignments.staffIds');
  }

  /**
   * Find available, physically nearest staff members
   */
  async findNearestAvailableStaff(location, role, limit = 5, requiredSkills = []) {
    let query = { role: role, status: 'Active' };
    if (role === 'driver') {
      query['driverProfile.isAvailable'] = true;
      if (requiredSkills && requiredSkills.length > 0) {
        query['driverProfile.skills'] = { $all: requiredSkills };
      }
    }

    const staffList = await User.find(query);
    if (!location || !location.coordinates || staffList.length === 0) return staffList.slice(0, limit);

    const point = turf.point(location.coordinates);

    // Distance calculation and sorting based on currentLocation of staff
    const sortedStaff = staffList.map(staff => {
      const coords = (staff.currentLocation && staff.currentLocation.coordinates && staff.currentLocation.coordinates.length === 2)
        ? staff.currentLocation.coordinates
        : [108.2022, 16.0544];
      const staffPoint = turf.point(coords);
      const distance = turf.distance(point, staffPoint, { units: 'kilometers' });
      return { ...staff.toObject(), distance };
    }).sort((a, b) => a.distance - b.distance);

    return sortedStaff.slice(0, limit);
  }

  /**
   * Gợi ý Smart Squad (Xe + Leader + Driver + Helper)
   * Integrates the new constraint-aware LogisticsEngine for precise resource allocation
   */
  async getOptimalSquad(totalWeight, totalVolume, pickupLocation, requiredSkills = [], options = {}) {
    let logisticsPlan = null;
    let chosenVehicleType = null;
    let neededTotalStaff = null;
    let ticket = null;

    // 1. Run through LogisticsEngine if ticket ID provided
    if (options.requestTicketId) {
      try {
        ticket = await RequestTicket.findById(options.requestTicketId).populate('surveyDataId');
        if (ticket) {
          const surveyData = ticket.surveyDataId ? ticket.surveyDataId : {};

          // Use SurveyData items if available, else ticket items
          let rawItems = [];
          if (surveyData && Array.isArray(surveyData.items) && surveyData.items.length > 0) {
            rawItems = surveyData.items;
          } else if (ticket.items) {
            Object.values(ticket.items.toJSON ? ticket.items.toJSON() : ticket.items).forEach(catItems => {
              if (Array.isArray(catItems)) {
                catItems.forEach(item => {
                  rawItems.push(item);
                });
              }
            });
          }

          // Normalize items format for the engine
          let itemsToProcess = rawItems.map(item => ({
            name: item.name,
            volume: item.actualVolume || (item.width && item.length && item.height ? (item.width * item.length * item.height / 1000000) : 0.1),
            weight: item.actualWeight || item.weight || 10,
            requiresPacking: item.requiresManualHandling || (Array.isArray(item.services) && item.services.includes('PACKING'))
          }));

          // If no items are found but we have total volume/weight, generate a dummy item to proxy the workload
          if (itemsToProcess.length === 0 && (surveyData.totalActualWeight || surveyData.totalActualVolume)) {
            itemsToProcess.push({
              name: 'Bulk Cargo',
              volume: surveyData.totalActualVolume || 1,
              weight: surveyData.totalActualWeight || 50,
              requiresPacking: false
            });
          }

          logisticsPlan = LogisticsEngine.generateDispatchPlan({
            items: itemsToProcess,
            surveyData: surveyData,
            constraints: { roadBanWeightLimit: 5000 }
          });

          // Trust Survey Explicit overrides for specific suggestions rather than pure heuristics if they exist and are explicitly set
          if (surveyData.suggestedVehicles && surveyData.suggestedVehicles.length > 0) {
            logisticsPlan.vehicles = surveyData.suggestedVehicles.map(v => ({
               type: v.vehicleType,
               trips: v.count || 1
            }));
          } else if (surveyData.suggestedVehicle && logisticsPlan.vehicles && logisticsPlan.vehicles.length > 0) {
            // You can choose whether to override entirely or just align types
            logisticsPlan.vehicles[0].type = surveyData.suggestedVehicle;
          }
          if (surveyData.suggestedStaffCount) {
            logisticsPlan.staffTotal = surveyData.suggestedStaffCount;
          }

          if (logisticsPlan && logisticsPlan.vehicles && logisticsPlan.vehicles.length > 0) {
            chosenVehicleType = logisticsPlan.vehicles[0].type;
            neededTotalStaff = logisticsPlan.staffTotal;
          }
        }
      } catch (e) {
        console.error('[DispatchService] Error running LogisticsEngine fallback to legacy:', e);
      }
    }

    // 2. Legacy fallback
    if (!chosenVehicleType) {
      const vehicleNeeds = await this.calculateVehicleNeeds(totalWeight, totalVolume);
      chosenVehicleType = vehicleNeeds[0].vehicleType;
    }

    // 3. Find suitable vehicle
    const vehicles = await this.findAvailableVehicles(chosenVehicleType, 1);
    if (!vehicles || vehicles.length === 0) {
      throw new AppError(`No vehicles available for the capacity: ${chosenVehicleType}`, 400);
    }
    const vehicle = vehicles[0];

    let vehicleDistance = null;
    if (pickupLocation && pickupLocation.coordinates && vehicle.currentLocation?.coordinates) {
      const p1 = turf.point(pickupLocation.coordinates);
      const p2 = turf.point(vehicle.currentLocation.coordinates);
      vehicleDistance = turf.distance(p1, p2, { units: 'kilometers' });
    }

    // 4. Find staff
    // neededCapacity defines the true number of staff required. If not derived from the new engine, fallback to driver+1
    const neededCapacity = neededTotalStaff !== null ? neededTotalStaff : (vehicle.maxStaff || 2);

    let duration = 480;
    if (logisticsPlan && logisticsPlan.estimatedMinutes) {
      duration = logisticsPlan.estimatedMinutes;
    }
    const requestedTime = options.dispatchTime || (ticket ? ticket.scheduledTime : null) || new Date();

    let totalVehicles = 1;
    if (logisticsPlan && logisticsPlan.vehicles) {
      totalVehicles = logisticsPlan.vehicles.reduce((sum, v) => sum + (v.trips || 1), 0);
    }

    const requiredLeaders = 1;
    const requiredDrivers = Math.max(0, totalVehicles - 1);
    const requiredHelpers = Math.max(0, neededCapacity - totalVehicles);

    const rules = {
      requiredLeaders,
      requiredHelpers,
      requiredDrivers,
      pickupLocation
    };

    const suggested = await this.suggestResources(requestedTime, duration, rules);
    const nextSlots = await this.suggestTimeSlots(requestedTime, duration, rules);

    return {
      vehicle: { ...vehicle.toObject(), distance: vehicleDistance },
      driver: suggested.rawTeam.drivers.length > 0 ? suggested.rawTeam.drivers[0] : null,
      drivers: suggested.rawTeam.drivers || [],
      leader: suggested.rawTeam.leader || null,
      helpers: suggested.rawTeam.helpers || [],
      logisticsPlan, // Includes equipment, transport details, staff counts natively
      shortages: suggested.shortages,
      nextAvailableSlots: nextSlots
    };
  }
}

module.exports = new DispatchService();
