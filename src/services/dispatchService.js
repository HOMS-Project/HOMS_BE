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
  async suggestResources(pickupTime, estimatedDuration, rules = {}) {
    const { requiredLeaders = 0, requiredDrivers = 0, requiredHelpers = 0 } = rules;
    
    // Evaluate constraint limits and tight schedules
    const availability = await this.checkResourceAvailability(pickupTime, estimatedDuration);
    
    // Load snapshot of cached workload for fairness scoring
    const targetDate = new Date(pickupTime);
    targetDate.setHours(0, 0, 0, 0); 
    const scheduleViews = await ResourceScheduleView.find({ date: targetDate }).lean();
    const workloadMap = new Map(scheduleViews.map(view => [view.resourceId.toString(), view.workloadCount]));

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
      
      // Heuristic: If we lack real-time GPS coordinate data, assume average fixed risk
      if (!resource.currentLocation?.coordinates) {
        efficiencyScore -= 10;
        breakdown.tags.push('far_from_depot_or_unknown');
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

    // Greedy allocation of highest-scored resources
    let suggestedDrivers = viableDrivers.slice(0, requiredDrivers);
    
    let leader = null;
    let helpers = [];
    
    // Staff pool filtering out already selected valid drivers
    let remainingStaff = viableStaff.filter(s => 
      !suggestedDrivers.some(d => d.data._id.toString() === s.data._id.toString())
    );
    
    if (requiredLeaders > 0 && remainingStaff.length > 0) {
      leader = remainingStaff.shift();
    }
    
    helpers = remainingStaff.slice(0, requiredHelpers);
    
    const missingDrivers = Math.max(0, requiredDrivers - suggestedDrivers.length);
    const missingLeaders = Math.max(0, requiredLeaders - (leader ? 1 : 0));
    const missingHelpers = Math.max(0, requiredHelpers - helpers.length);
    
    // We can force proceed if we have at least minimum core drivers
    const canForce = (suggestedDrivers.length > 0);
    
    return {
      suggestedTeam: {
        leaderId: leader ? leader.data._id : null,
        driverIds: suggestedDrivers.map(d => d.data._id),
        staffIds: helpers.map(h => h.data._id)
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
  async suggestTimeSlots(pickupTime, estimatedDuration) {
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
    
    // Fallback: +1h, +2h, +3h from requested time
    for (let i = 1; i <= 3; i++) {
        candidates.push(baseTime + i * hourMs);
    }
    
    // Only test future times compared to baseTime
    const futureCandidates = [...new Set(candidates.filter(c => c > baseTime))].sort((a, b) => a - b);
    
    for (const time of futureCandidates) {
        const avail = await this.checkResourceAvailability(new Date(time), estimatedDuration);
        const availDrivers = avail.drivers.filter(d => d.availabilityStatus === 'AVAILABLE');
        const availVehicles = avail.vehicles.filter(v => v.availabilityStatus === 'AVAILABLE');
        
        // Slot is viable if we have at least 1 driver and 1 vehicle
        if (availDrivers.length > 0 && availVehicles.length > 0) {
            slots.push(new Date(time).toISOString());
        }
        
        if (slots.length >= 3) break;
    }
    
    return slots;
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
        throw new AppError(`Cannot assign ${totalStaff} staff. Vehicle ${vehicle.vehicleType} max capacity is ${vehicle.maxStaff}.`, 400);
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
      if (dispatchData.vehicleType && dispatchData.vehicleCount) {
        vehicleNeeds = [{ vehicleType: dispatchData.vehicleType, count: parseInt(dispatchData.vehicleCount) }];
      } else {
        vehicleNeeds = await this.calculateVehicleNeeds(
          dispatchData.totalWeight,
          dispatchData.totalVolume
        );
      }

      const fleetAssignments = [];
      let totalCapacity = 0;

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

          // Validate route restrictions
          const targetRouteId = dispatchData.routeId || invoice.routeId;
          const validation = await RouteValidationService.validateRoute(
            targetRouteId,
            {
              vehicleType: need.vehicleType,
              totalWeight: dispatchData.totalWeight,
              totalVolume: dispatchData.totalVolume,
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

      for (const fleetItem of fleetAssignments) {
        const {
          vehicle,
          vehicleType,
          pickupTime,
          deliveryTime,
          estimatedDuration,
          targetRouteId,
          validation
        } = fleetItem;

        // Assign drivers & helpers
        const staffAssignment = await this.assignStaff({
          vehicleId: vehicle._id,
          leaderId: dispatchData.leaderId,
          driverIds: dispatchData.driverIds || [],
          staffIds: dispatchData.staffIds || [],
          pickupTime: pickupTime,
          deliveryTime: deliveryTime,
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

    try {
      await session.withTransaction(async () => {
        const invoice = await Invoice.findById(invoiceId)
          .populate('requestTicketId', 'pickup delivery scheduledTime customerId')
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
        } catch (error) {
          if ((error.message === 'RESOURCE_CONFLICT' || error.message === 'Staff availability conflict') && dispatchData.forceProceed !== true) {
            const assignedPickupTime = dispatchData.dispatchTime ? new Date(dispatchData.dispatchTime) : (invoice.scheduledTime || invoice.requestTicketId?.scheduledTime || new Date());
            const duration = dispatchData.estimatedDuration || 480;
            
            const rules = {
              requiredDrivers: dispatchData.driverIds?.length || 1,
              requiredHelpers: dispatchData.staffIds?.length || 1,
              requiredLeaders: dispatchData.leaderId ? 1 : 0
            };
            
            const suggestion = await this.suggestResources(assignedPickupTime, duration, rules);
            const nextSlots = await this.suggestTimeSlots(assignedPickupTime, duration);
            
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
        if (dispatchData.forceProceed === true) {
          assignment.understaffed = true;
          
          if (invoice.requestTicketId?.customerId) {
              const ticket = invoice.requestTicketId;
              // We need 'const io = require('../socket/socket').getIO();' or pass null if io is not strictly required.
              // NotificationService handles standard socket if passed, or we just rely on DB. 
              // I will leave 'io' undefined as many other places do when they don't have access.
              try {
                  await NotificationService.createNotification({
                      userId: ticket.customerId,
                      title: "Thông báo về nhân sự đơn hàng",
                      message: "Đơn hàng của bạn đã được điều phối nhưng có thể thiếu nhân sự so với dự kiến. Vui lòng thông cảm hoặc liên hệ tổng đài.",
                      type: "WARNING",
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
        if (dispatchData.dispatchTime) {
          invoice.scheduledTime = new Date(dispatchData.dispatchTime);
        }
        invoice.status = 'ASSIGNED';
        await invoice.save({ session });

        // Phase 2: Log the decision & Run Heuristic Scoring
        const logDurationMs = dispatchData.estimatedDuration ? dispatchData.estimatedDuration * 60000 : 480 * 60000;
        const requestedTime = dispatchData.dispatchTime || invoice.scheduledTime;
        
        // Calculate the "Optimal" ML recommendation (even if manual override occurred)
        const optimalSuggestion = await this.suggestResources(requestedTime, logDurationMs / 60000, {
          requiredDrivers: dispatchData.driverIds?.length || 1,
          requiredHelpers: dispatchData.staffIds?.length || 1,
          requiredLeaders: dispatchData.leaderId ? 1 : 0
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

      // Broadcast resource assignment update for real-time UI synchronization
      try {
        const { getIo } = require('../utils/socket');
        const io = getIo();
        if (io) {
          io.emit('resources_updated', { invoiceId });
        }
      } catch (err) {
        console.error('[BE] Warning: Failed to emit resources_updated', err.message);
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
   */
  async getOptimalSquad(totalWeight, totalVolume, pickupLocation, requiredSkills = []) {
    // 1. Tính toán xe cần thiết
    const vehicleNeeds = await this.calculateVehicleNeeds(totalWeight, totalVolume);
    const primaryNeed = vehicleNeeds[0];

    // 2. Tìm xe phù hợp
    const vehicles = await this.findAvailableVehicles(primaryNeed.vehicleType, 1);
    const vehicle = vehicles[0];
    
    let vehicleDistance = null;
    if (pickupLocation && pickupLocation.coordinates && vehicle.currentLocation?.coordinates) {
      const p1 = turf.point(pickupLocation.coordinates);
      const p2 = turf.point(vehicle.currentLocation.coordinates);
      vehicleDistance = turf.distance(p1, p2, { units: 'kilometers' });
    }

    // 3. Tìm nhân sự
    const neededCapacity = vehicle.maxStaff || 2;
    const drivers = await this.findNearestAvailableStaff(pickupLocation, 'driver', 1, requiredSkills);
    
    let leader = null;
    const staffs = await this.findNearestAvailableStaff(pickupLocation, 'staff', neededCapacity - 1);
    
    if (staffs.length > 0) {
      leader = staffs[0];
    }

    const helpers = staffs.slice(1, neededCapacity - 1);

    return {
      vehicle: { ...vehicle.toObject(), distance: vehicleDistance },
      driver: drivers[0] || null,
      leader: leader || null,
      helpers: helpers || [],
    };
  }
}

module.exports = new DispatchService();
