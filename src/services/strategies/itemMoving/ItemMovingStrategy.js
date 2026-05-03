const BaseStrategy = require('../BaseStrategy');
const AppError = require('../../../utils/appErrors');
const SurveyData = require('../../../models/SurveyData');
const AutoAssignmentService = require('../../AutoAssignmentService');
const NotificationService = require('../../notificationService');
const T = require('../../../utils/notificationTemplates');
const User = require('../../../models/User');
const TicketStateMachine = require('../../TicketStateMachine');

class ItemMovingStrategy extends BaseStrategy {
  validateCreate(data) {
    if (!data.pickup?.address || !data.delivery?.address) {
      throw new AppError('Pickup và delivery address không được rỗng', 400);
    }
    if (data.pickup.address === data.delivery.address) {
      throw new AppError('Pickup và delivery phải khác nhau', 400);
    }
    if (!data.items || data.items.length === 0) {
      throw new AppError('SPECIFIC_ITEMS phải có ít nhất 1 item', 400);
    }
  }

  getAllowedTransitions(currentStatus) {
    // SPECIFIC_ITEMS skips survey — goes to district dispatcher review after HD approval
    const transitions = {
      CREATED: ['WAITING_REVIEW', 'CANCELLED'],
      WAITING_REVIEW: ['QUOTED', 'CANCELLED'],
      ASSIGNMENT_FAILED: ['WAITING_REVIEW', 'CANCELLED'], // Head dispatcher reassigns manually
      QUOTED: ['ACCEPTED', 'CANCELLED'],
      ACCEPTED: ['CONVERTED', 'CANCELLED'],
      CONVERTED: [],
      CANCELLED: []
    };
    return transitions[currentStatus] || [];
  }

  async handlePostCreation(ticket, data) {
    if (data.items && data.items.length > 0) {
      const SurveyService = require('../../surveyService');
      const PricingCalculationService = require('../../pricingCalculationService');
      const PriceList = require('../../../models/PriceList');

      // 1. BE calculates resources based on the AI items array (ignoring AI's vehicle/staff suggestion)
      const estimate = await SurveyService.estimateResources({
        items: data.items,
        distanceKm: data.distanceKm || 0,
        floors: 0, // floors typically unknown initially
        hasElevator: false // elevator unknown initially
      });

      // 2. Perform a Dry-Run Pricing Calculation to get an Estimated Price for the UI
      let estimatedPrice = 0;
      try {
        const activePriceList = await PriceList.findOne({ isActive: true });
        if (activePriceList) {
          const mockSurveyData = {
            suggestedVehicle: estimate.suggestedVehicle,
            suggestedStaffCount: estimate.suggestedStaffCount,
            distanceKm: estimate.distanceKm || 0,
            totalActualVolume: estimate.totalVolume,
            totalActualWeight: estimate.totalWeight,
            carryMeter: 0,
            floors: 0,
            hasElevator: false,
            needsAssembling: false,
            needsPacking: false,
            insuranceRequired: false,
            declaredValue: 0,
            items: data.items
          };

          const pricingResult = await PricingCalculationService.calculatePricing(mockSurveyData, activePriceList);
          // Store the total calculated price as the estimated price
          estimatedPrice = pricingResult.totalPrice;
        }
      } catch (error) {
        console.warn(`[ItemMovingStrategy] Could not calculate estimated price for ticket ${ticket._id}:`, error.message);
      }

      // 3. Save the SurveyData with the BE's resource allocation and estimated price
      const surveyDataOptions = {
        requestTicketId: ticket._id,
        surveyType: 'ONLINE', // AI analysis is an online survey
        status: 'COMPLETED', // Completed from customer's view
        items: data.items,
        totalActualVolume: estimate.totalVolume,
        totalActualWeight: estimate.totalWeight,
        suggestedVehicle: estimate.suggestedVehicle,
        suggestedStaffCount: estimate.suggestedStaffCount,
        distanceKm: estimate.distanceKm || 0,
        estimatedPrice: estimatedPrice
      };

      if (data.images && Array.isArray(data.images)) {
        surveyDataOptions.images = data.images;
      }

      const surveyData = new SurveyData(surveyDataOptions);

      await surveyData.save();
    }
  }

  async handleApproval(ticket, approverId, additionalData = {}, io) {
    await TicketStateMachine.transition(ticket, 'WAITING_REVIEW');

    let assignedDispatcherId = additionalData?.surveyorId;
    let assignmentMethod = 'MANUAL';

    if (!assignedDispatcherId) {
      assignedDispatcherId = await AutoAssignmentService.assignDispatcher(ticket);
      assignmentMethod = 'AUTO';
    }

    if (assignedDispatcherId) {
      // Auto-assignment successful — district dispatcher will review AI data and quote
      ticket.dispatcherId = assignedDispatcherId;
      await ticket.save();

      console.log(`[ItemMovingStrategy] Assigned dispatcher ${assignedDispatcherId} via ${assignmentMethod}`);

      await NotificationService.createNotification(
        {
          userId: assignedDispatcherId,
          ...T.TICKET_ASSIGNED_TO_DISPATCHER({ ticketCode: ticket.code }),
          ticketId: ticket._id
        },
        io
      );

      await NotificationService.createNotification(
        {
          userId: ticket.customerId,
          ...T.ORDER_ACCEPTED_ITEM_MOVING(),
          ticketId: ticket._id
        },
        io
      );

    } else {
      // Auto-assignment failed — escalate to Head Dispatcher
      await TicketStateMachine.transition(ticket, 'ASSIGNMENT_FAILED', {
        comment: 'Auto assignment failed for requested driver/porters.'
      });

      // Notify Head Dispatcher (admins / isGeneral dispatchers)
      const headDispatchers = await User.find({
        role: 'dispatcher',
        'dispatcherProfile.isGeneral': true
      }).select('_id');

      for (const hd of headDispatchers) {
        await NotificationService.createNotification(
          {
            userId: hd._id,
            ...T.AUTO_ASSIGNMENT_FAILED_ITEM_MOVING({ ticketCode: ticket.code }),
            ticketId: ticket._id
          },
          io
        );
      }
    }

    return ticket;
  }
}

module.exports = ItemMovingStrategy;
