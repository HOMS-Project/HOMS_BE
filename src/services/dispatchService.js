const mongoose = require('mongoose');
const DispatchAssignment = require('../models/DispatchAssignment');
const DispatchDecisionLog = require('../models/DispatchDecisionLog');
const ResourceScheduleView = require('../models/ResourceScheduleView');
const Invoice = require('../models/Invoice');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');

const RouteValidationService = require('./routeValidationService');
const NotificationService = require('./notificationService');
const T = require('../utils/notificationTemplates');
const LogisticsEngine = require('./logisticsEngine');
const RequestTicket = require('../models/RequestTicket');
const turf = require('@turf/turf');
const FeasibilityEngine = require('./dispatch/feasibilityEngine');
const AppError = require('../utils/appErrors');

class DispatchService {

  calculateDeliveryTime({ pickupTime, estimatedDuration, buffer = 0 }) {
    if (!pickupTime) return null;
    const durationInMs = (estimatedDuration + buffer) * 60000;
    return new Date(new Date(pickupTime).getTime() + durationInMs);
  }

  /**
   * Core Decision Engine for Force Dispatch
   */
  async evaluateFeasibility(dispatchData, idealStaffCount, baseHours) {
    const inputStaffCount = (dispatchData.leaderId ? 1 : 0) +
      (dispatchData.driverIds?.length || 0) +
      (dispatchData.staffIds?.length || 0);

    const adjustedMinutes = FeasibilityEngine.estimateDuration(baseHours, idealStaffCount, inputStaffCount);

    const safety = FeasibilityEngine.checkSafety(inputStaffCount, idealStaffCount, adjustedMinutes);
    const staffing = FeasibilityEngine.evaluateStaffing(inputStaffCount, idealStaffCount);

    if (dispatchData.useExternalStaff) {
      staffing.level = 'SAFE';
      safety.isSafetyBlock = false;
      safety.durationExceeded = false;
    }

    const resourceIds = [
      ...(dispatchData.vehicles || []).map(v => v.vehicleId),
      dispatchData.leaderId,
      ...(dispatchData.driverIds || []),
      ...(dispatchData.staffIds || [])
    ].filter(id => id);

    const conflictInfo = await FeasibilityEngine.detectConflicts(this, resourceIds, dispatchData.dispatchTime || new Date(), adjustedMinutes);

    let decision = 'ALLOW';
    if (safety.durationExceeded || safety.isSafetyBlock) {
      decision = 'BLOCK';
    } else if (staffing.level === 'CRITICAL') {
      decision = 'REQUIRE_CUSTOMER';
    } else if (staffing.level === 'WARNING' || conflictInfo.hasConflict) {
      decision = 'CONFIRM';
    } else {
      decision = 'ALLOW';
    }

    return {
      staffingRatio: staffing.ratio,
      staffingLevel: staffing.level,
      estimatedDuration: adjustedMinutes,
      durationExceeded: safety.durationExceeded,
      hasConflict: conflictInfo.hasConflict,
      impactLevel: conflictInfo.impactLevel,
      maxDelayMinutes: conflictInfo.maxDelayMinutes,
      decision
    };
  }

  /**
   * Detects if any assigned resources for this job have subsequent tasks 
   * that would be delayed by the calculated duration of the current job.
   */
  async detectDownstreamConflicts(resourceIds, startTime, durationMinutes) {
    const startMs = new Date(startTime).getTime();
    const endMs = startMs + (durationMinutes * 60000);

    // Find all future tasks for these resources
    const nextTasks = await DispatchAssignment.find({
      status: { $in: ['PENDING', 'ASSIGNED', 'CONFIRMED', 'IN_PROGRESS'] },
      'assignments.pickupTime': { $gt: new Date(startMs) }
    }).lean();

    let hasConflict = false;
    let maxDelayMinutes = 0;

    for (const da of nextTasks) {
      for (const task of da.assignments) {
        const isResourceInvolved = resourceIds.some(id =>
          task.vehicleId?.toString() === id?.toString() ||
          task.driverIds?.some(dId => dId.toString() === id?.toString()) ||
          task.staffIds?.some(sId => sId.toString() === id?.toString())
        );

        if (isResourceInvolved) {
          const taskStartMs = new Date(task.pickupTime).getTime();
          if (taskStartMs < endMs) {
            hasConflict = true;
            const delay = (endMs - taskStartMs) / 60000;
            if (delay > maxDelayMinutes) maxDelayMinutes = Math.round(delay);
          }
        }
      }
    }

    let impactLevel = 'NONE';
    if (hasConflict) {
      impactLevel = maxDelayMinutes > 60 ? 'HIGH' : 'LOW';
    }

    return { hasConflict, maxDelayMinutes, impactLevel };
  }

  /**
   * Calculate adjusted duration for understaffed dispatch
   * T_actual = T_base * (S_required / S_actual) ^ alpha
   * alpha = 1.3 accounts for inefficiency
   */
  calculateAdjustedDuration(baseDuration, requiredStaff, actualStaff) {
    if (!baseDuration || !requiredStaff || !actualStaff) return baseDuration;
    if (actualStaff >= requiredStaff) return baseDuration;

    const alpha = 1.3;
    const ratio = requiredStaff / actualStaff;
    const adjustmentFactor = Math.pow(ratio, alpha);

    return Math.round(baseDuration * adjustmentFactor);
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
    const baseDate = new Date(pickupTime);
    const popularHours = [7, 9, 14, 16]; // Popular hours: 7:00, 9:00, 14:00, 16:00

    // Generate candidate slots for today and tomorrow
    const candidates = [];

    // For today (starting from baseDate) and tomorrow
    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      const targetDate = new Date(baseDate);
      targetDate.setDate(targetDate.getDate() + dayOffset);

      for (const hour of popularHours) {
        const candidate = new Date(targetDate);
        candidate.setHours(hour, 0, 0, 0);

        // Only consider future slots compared to the current pickupTime
        if (candidate.getTime() > baseDate.getTime()) {
          candidates.push(candidate);
        }
      }
    }

    // Sort candidates chronologically
    candidates.sort((a, b) => a.getTime() - b.getTime());

    for (const time of candidates) {
      const avail = await this.checkResourceAvailability(time, estimatedDuration);
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
        slots.push(time.toISOString());
      }

      // Limit to 4 suggested slots
      if (slots.length >= 4) break;
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
  /**
   * Returns weight capacity (kg) for a given vehicle type.
   * Used by allocateFleet to accumulate total cargo capacity.
   */
  /**
   * Returns a capacity utilization status string based on how much of the vehicle
   * capacity is being used (NORMAL / WARNING / OVERLOADED).
   */
  determineCapacityStatus(vehicleType, loadWeight) {
    const capacity = this.getVehicleCapacity(vehicleType);
    const ratio = loadWeight / capacity;
    if (ratio > 1.0) return 'OVERLOAD';
    if (ratio > 0.85) return 'FULL';
    if (ratio > 0.5)  return 'OPTIMAL';
    return 'UNDERUTILIZED';
  }

  getVehicleCapacity(vehicleType) {
    const MAP = { '500KG': 500, '1TON': 1000, '1.5TON': 1500, '2TON': 2000, '5TON': 5000 };
    return MAP[vehicleType] || 1000;
  }

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

        // =========================
        // STEP 3: Save Assignment
        // =========================
        let assignment = await DispatchAssignment.findOne({ invoiceId }).session(session);
        if (!assignment) {
          assignment = new DispatchAssignment({ invoiceId });
        }

        const surveyData = invoice.requestTicketId?.surveyDataId || {};
        const idealStaffCount = surveyData.suggestedStaffCount || 2;
        const baseHours = surveyData.estimatedHours || 8;

        // ── Feasibility & Safety Engine ──
        const feasibility = await this.evaluateFeasibility(dispatchData, idealStaffCount, baseHours);
        dispatchData.estimatedDuration = feasibility.estimatedDuration;
        assignment.feasibility = feasibility; // Cache assessment for this assignment record

        // Decision: BLOCK -> Hard Stop
        if (feasibility.decision === 'BLOCK') {
          const err = new AppError('MAX_DURATION_EXCEEDED', 400);
          err.data = { feasibility };
          throw err;
        }

        // Decision: REQUIRE_CUSTOMER -> Block unless dispatcher forces it (which might later require customer approval on FE)
        // For simplicity now, let's treat it as a block that needs forceProceed or customerApproved
        const isResolutionNeeded = (feasibility.decision === 'CONFIRM' || feasibility.decision === 'REQUIRE_CUSTOMER');

        let fleetAssignments, totalCapacity, idealVehicles, isResourceSubstitution, assignmentRecords, totalStaff;
        try {
          // Step 1: Allocate fleet (vehicles)
          console.log(`[BE] createDispatchAssignment: Step 1 - Allocating Fleet...`);
          const fleetAlloc = await this.allocateFleet(invoice, dispatchData, session);
          fleetAssignments = fleetAlloc.fleetAssignments;
          totalCapacity = fleetAlloc.totalCapacity;

          // Detect Resource Substitution
          idealVehicles = await this.calculateVehicleNeeds(dispatchData.totalWeight, dispatchData.totalVolume);
          isResourceSubstitution = dispatchData.isResourceSubstitution || 
                                         (dispatchData.vehicles && dispatchData.vehicles.length > 0 && 
                                          JSON.stringify(dispatchData.vehicles) !== JSON.stringify(idealVehicles));

          // Step 2: Allocate personnel (drivers and helpers)
          console.log(`[BE] createDispatchAssignment: Step 2 - Allocating Personnel...`);
          const allocResult = await this.allocatePersonnel(fleetAssignments, dispatchData, session);
          assignmentRecords = allocResult.assignmentRecords;
          totalStaff = allocResult.totalStaff;

          if ((totalStaff < idealStaffCount && !dispatchData.useExternalStaff) || feasibility.hasConflict) {
            // Even if staff count matches, if there's a conflict and we haven't forced it, we need resolution
            if (isResolutionNeeded && !dispatchData.forceProceed && !dispatchData.useExternalStaff) {
              throw new AppError('INSUFFICIENT_RESOURCES', 400);
            }
          }
        } catch (error) {
          const isVehicleShortage = error.message.includes('Not enough vehicles');
          if ((error.message === 'RESOURCE_CONFLICT' || error.message === 'Staff availability conflict' || error.message === 'INSUFFICIENT_RESOURCES' || isVehicleShortage) && !dispatchData.forceProceed) {
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
              canForce: suggestion.canForce,
              feasibility: feasibility // Include the 3-layer assessment
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

        // ── Scenario B: Time change → propose to customer instead of silently updating ──
        // NOTE: isTimeChanged check happens BEFORE saving the assignment so we can set the
        // correct status. If the time is different, keep the assignment as DRAFT until the
        // customer approves. If accepted, the confirmReschedule controller upgrades it to ASSIGNED.
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

            // ✅ FIX: Keep assignment as DRAFT while awaiting customer approval.
            // The assignment will be promoted to ASSIGNED in confirmReschedule when customer ACCEPTs.
            assignment.status = 'DRAFT';
          } else {
            // Same time or negligible diff → update directly and mark as ASSIGNED
            invoice.scheduledTime = newTime;
            assignment.status = 'ASSIGNED';

            // Sync the confirmed time back to the RequestTicket so ViewMovingOrder shows it correctly
            if (invoice.requestTicketId?._id) {
              await RequestTicket.findByIdAndUpdate(invoice.requestTicketId._id, { scheduledTime: newTime }).session(session);
            }
          }
        } else {
          assignment.status = 'ASSIGNED';
        }

        const explicitDriverIds = this.extractUniqueIdsFromAssignments(assignmentRecords, 'driverIds');
        const roleCandidateIds = this.extractUniqueIdsFromAssignments(assignmentRecords, 'staffIds');
        const driverIds = [...new Set([...explicitDriverIds, ...roleCandidateIds])];
        const requestCode = invoice.requestTicketId?.code || invoice.code || null;
        driverNotificationContext = {
          driverIds,
          ticketId: invoice.requestTicketId?._id || invoice.requestTicketId || null,
          requestCode
        };

        // Handle Understaffed Logic
        if (totalStaff < idealStaffCount) {
          const originalDuration = dispatchData.estimatedDuration || 480;
          const adjustedDuration = this.calculateAdjustedDuration(originalDuration, idealStaffCount, totalStaff);
          const durationAdjustment = Math.round(((adjustedDuration / originalDuration) - 1) * 100);

          assignment.understaffed = true;
          assignment.originalDuration = originalDuration;
          assignment.adjustedDuration = adjustedDuration;
          assignment.durationAdjustment = durationAdjustment;
          // Update delivery times in assignment records based on adjusted duration
          assignment.assignments.forEach(rec => {
            rec.estimatedDuration = adjustedDuration;
            rec.deliveryTime = this.calculateDeliveryTime({
              pickupTime: rec.pickupTime,
              estimatedDuration: adjustedDuration
            });
          });
        }

        // Assignment status: DRAFT only when awaiting customer approval for reschedule (flow 2a).
        // useExternalStaff resolves understaffing for flow 2b — mark audit flag.
        if (dispatchData.useExternalStaff) {
          assignment.externalStaffUsed = true;
        }
        // Only override to ASSIGNED here if not already set to DRAFT by the time-change block above
        if (assignment.status !== 'DRAFT') {
          assignment.status = 'ASSIGNED';
        }

        if (dispatchData.forceProceed === true && totalStaff < idealStaffCount && !dispatchData.useExternalStaff) {
          assignment.understaffed = true;

          if (invoice.requestTicketId?.customerId) {
            const ticket = invoice.requestTicketId;
            try {
              await NotificationService.createNotification({
                userId: ticket.customerId,
                ...T.DISPATCH_UNDERSTAFFED({
                  actualStaff: totalStaff,
                  requiredStaff: idealStaffCount,
                  durationIncrease: invoice.understaffedDetails?.estimatedDurationIncrease
                }),
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

        // =========================
        // STEP 4: Update Invoice
        // =========================
        invoice.dispatchAssignmentId = assignment._id;
        if (dispatchData.forceProceed === true && totalStaff < idealStaffCount && !dispatchData.useExternalStaff) {
          assignment.understaffed = true;

          if (invoice.requestTicketId?.customerId) {
            const ticket = invoice.requestTicketId;
            try {
              await NotificationService.createNotification({
                userId: ticket.customerId,
                ...T.DISPATCH_UNDERSTAFFED({
                  actualStaff: totalStaff,
                  requiredStaff: idealStaffCount,
                  durationIncrease: invoice.understaffedDetails?.estimatedDurationIncrease
                }),
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

        // =========================
        // STEP 4: Update Invoice
        // =========================
        invoice.dispatchAssignmentId = assignment._id;
        if (dispatchData.routeId) {
          invoice.routeId = dispatchData.routeId;
        }

        // Mark invoice as ASSIGNED after successful dispatch
        invoice.status = 'ASSIGNED';
        await invoice.save({ session });

        // ── Scenario A: Dispatch success notification ─────────────────────
        try {
          const ticket = invoice.requestTicketId;
          let ioInstance = null;
          try { const { getIo } = require('../utils/socket'); ioInstance = getIo(); } catch (_) { /* no-op */ }
          const dayjs = require('dayjs');
          await NotificationService.createNotification({
            userId: ticket.customerId,
            ...T.DISPATCH_SUCCESS({
              ticketCode: ticket?.code || 'Không xác định',
              dispatchTime: dayjs(invoice.scheduledTime).format('HH:mm DD/MM/YYYY'),
              vehicleCount: fleetAssignments ? fleetAssignments.length : 1
            }),
            ticketId: ticket._id
          }, ioInstance);
        } catch (notifErr) {
          console.error('[BE] Warning: Failed to send dispatch success notification', notifErr);
        }

        // ── Scenario B: Notify customer of reschedule proposal ─────────────
        if (invoice.rescheduleStatus === 'PENDING_APPROVAL') {
          try {
            const ticket = invoice.requestTicketId;
            let ioInstance = null;
            try { const { getIo } = require('../utils/socket'); ioInstance = getIo(); } catch (_) { /* no-op */ }
            const dayjs = require('dayjs');
            await NotificationService.createNotification({
              userId: ticket.customerId,
              ...T.DISPATCH_RESCHEDULE_PROPOSED({
                ticketCode: ticket?.code || 'Không xác định',
                proposedTime: dayjs(invoice.proposedDispatchTime).format('HH:mm DD/MM/YYYY')
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

      return resultAssignment;

    } catch (error) {
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =========================  // EXISTING LOGIC (GIỮ NGUYÊN)
  // =========================
  async calculateVehicleNeeds(totalWeight, totalVolume) {
    const VEHICLE_SPECS = {
      '500KG': { maxWeight: 500, maxVolume: 5 },
      '1TON': { maxWeight: 1000, maxVolume: 10 },
      '1.5TON': { maxWeight: 1500, maxVolume: 15 },
      '2TON': { maxWeight: 2000, maxVolume: 20 }
    };

    const vehicleTypes = ['500KG', '1TON', '1.5TON', '2TON'];

    for (const type of vehicleTypes) {
      const spec = VEHICLE_SPECS[type];
      if (totalWeight <= spec.maxWeight && totalVolume <= spec.maxVolume) {
        return [{ vehicleType: type, count: 1 }];
      }
    }

    const largest = VEHICLE_SPECS['2TON'];
    const count = Math.ceil(Math.max(
      totalWeight / largest.maxWeight,
      totalVolume / largest.maxVolume
    ));

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
    let surveyData = null;

    // 1. Run through LogisticsEngine if ticket ID provided
    if (options.requestTicketId) {
      try {
        ticket = await RequestTicket.findById(options.requestTicketId).populate('surveyDataId');
        if (ticket) {
          surveyData = ticket.surveyDataId ? ticket.surveyDataId : {};

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
            neededTotalStaff = surveyData.suggestedStaffCount;
          } else if (logisticsPlan && logisticsPlan.staffTotal) {
            neededTotalStaff = logisticsPlan.staffTotal;
          }

          if (logisticsPlan && logisticsPlan.vehicles && logisticsPlan.vehicles.length > 0) {
            chosenVehicleType = logisticsPlan.vehicles[0].type;
          }
        }
      } catch (e) {
        console.error('[DispatchService] LogisticsEngine error:', e.message, e.stack?.split('\n')[1]);
      }
      console.log('[BE] After engine: logisticsPlan?.staffTotal =', logisticsPlan?.staffTotal, '| neededTotalStaff =', neededTotalStaff, '| items count =', logisticsPlan === null ? 'ENGINE_SKIPPED' : 'ran');
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
    console.log('[BE] neededTotalStaff:', neededTotalStaff, 'neededCapacity:', neededCapacity, 'surveyData.suggestedStaffCount:', surveyData?.suggestedStaffCount);

    let duration = 480;
    if (surveyData && surveyData.estimatedHours) {
      duration = surveyData.estimatedHours * 60;
    } else if (logisticsPlan && logisticsPlan.estimatedMinutes) {
      duration = logisticsPlan.estimatedMinutes;
    }
    const requestedTime = options.dispatchTime || (ticket ? ticket.scheduledTime : null) || new Date();

    let totalVehicles = 1;
    if (logisticsPlan && logisticsPlan.vehicles) {
      totalVehicles = logisticsPlan.vehicles.reduce((sum, v) => sum + (v.trips || 1), 0);
    }

    const requiredLeaders = 1;
    const requiredDrivers = Math.max(0, totalVehicles - 1);
    const requiredHelpers = Math.max(0, neededCapacity - requiredLeaders - requiredDrivers);

    const rules = {
      requiredLeaders,
      requiredHelpers,
      requiredDrivers,
      pickupLocation
    };

    const suggested = await this.suggestResources(requestedTime, duration, rules);
    const nextSlots = await this.suggestTimeSlots(requestedTime, duration, rules);

    // Calculate feasibility for the suggested squad
    const squadDispatchData = {
      leaderId: suggested.rawTeam.leader?._id,
      driverIds: (suggested.rawTeam.drivers || []).map(d => d._id),
      staffIds: (suggested.rawTeam.helpers || []).map(h => h._id),
      vehicles: [{ vehicleId: vehicle._id }],
      dispatchTime: requestedTime
    };
    const feasibility = await this.evaluateFeasibility(squadDispatchData, neededCapacity, duration / 60);

    return {
      vehicle: { ...vehicle.toObject(), distance: vehicleDistance },
      driver: suggested.rawTeam.drivers.length > 0 ? suggested.rawTeam.drivers[0] : null,
      drivers: suggested.rawTeam.drivers || [],
      leader: suggested.rawTeam.leader || null,
      helpers: suggested.rawTeam.helpers || [],
      logisticsPlan, // Includes equipment, transport details, staff counts natively
      shortages: suggested.shortages,
      nextAvailableSlots: nextSlots,
      feasibility
    };
  }
}

module.exports = new DispatchService();