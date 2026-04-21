const BaseStrategy = require('../BaseStrategy');
const AppError = require('../../../utils/appErrors');
const SurveyData = require('../../../models/SurveyData');
const AutoAssignmentService = require('../../AutoAssignmentService');
const NotificationService = require('../../notificationService');
const T = require('../../../utils/notificationTemplates');
const User = require('../../../models/User');
const TicketStateMachine = require('../../TicketStateMachine');

class TruckRentalStrategy extends BaseStrategy {
  validateCreate(data) {
    if (!data.pickup?.address) {
      throw new AppError('Pickup address không được rỗng đối với dịch vụ thuê xe', 400);
    }
    if (!data.rentalDetails?.truckType) {
      throw new AppError('Dịch vụ thuê xe yêu cầu truckType trong rentalDetails', 400);
    }
    if (!data.rentalDetails?.rentalDurationHours || data.rentalDetails.rentalDurationHours <= 0) {
      throw new AppError('Dịch vụ thuê xe yêu cầu thời gian thuê (rentalDurationHours) hợp lệ', 400);
    }
    if (!data.scheduledTime) {
      throw new AppError('Yêu cầu chọn thời gian bắt đầu thuê (scheduledTime)', 400);
    }
  }

  getAllowedTransitions(currentStatus) {
    // TRUCK_RENTAL skips survey — goes to district dispatcher review after HD approval
    const transitions = {
      CREATED:           ['WAITING_REVIEW', 'QUOTED', 'CANCELLED'],
      WAITING_REVIEW:    ['QUOTED', 'CANCELLED'],
      ASSIGNMENT_FAILED: ['WAITING_REVIEW', 'QUOTED', 'CANCELLED'], // Head dispatcher reassigns manually
      QUOTED:            ['ACCEPTED', 'CANCELLED'],
      ACCEPTED:          ['CONVERTED', 'CANCELLED'],
      CONVERTED:         [],
      CANCELLED:         []
    };
    return transitions[currentStatus] || [];
  }

  async handlePostCreation(ticket, data) {
    // TRUCK_RENTAL logic: Auto-calculate and save endTime based on duration
    if (ticket.scheduledTime && data.rentalDetails?.rentalDurationHours) {
      const startTime = new Date(ticket.scheduledTime);
      const endTime = new Date(startTime.getTime() + (data.rentalDetails.rentalDurationHours * 60 * 60 * 1000));
      ticket.endTime = endTime;
      await ticket.save();
    }

    if (data.items && data.items.length > 0) {
      const SurveyService = require('../../surveyService');
      const PricingCalculationService = require('../../pricingCalculationService');
      const PriceList = require('../../../models/PriceList');

      // 1. BE calculates resources based on the AI items array
      const estimate = await SurveyService.estimateResources({
        items: data.items, 
        distanceKm: data.distanceKm || 0, 
        floors: 0, 
        hasElevator: false 
      });

      // 2. Try to get a Dry-Run price based on BE resources
      let estimatedPrice = 0;
      try {
        const activePriceList = await PriceList.findOne({ isActive: true });
        if (activePriceList) {
          const mockSurveyData = {
            // For TRUCK_RENTAL, user might pick a truckType themselves.
            // If they do, use it; otherwise use BE's suggestion.
            suggestedVehicle: data.rentalDetails?.truckType || estimate.suggestedVehicle,
            suggestedStaffCount: estimate.suggestedStaffCount,
            distanceKm: estimate.distanceKm || 0,
            totalActualVolume: estimate.totalVolume,
            totalActualWeight: estimate.totalWeight,
            carryMeter: 0,
            floors: 0,
            hasElevator: false,
            needsAssembling: data.rentalDetails?.needsAssembling || false,
            needsPacking: data.rentalDetails?.needsPacking || false,
            insuranceRequired: false,
            declaredValue: 0,
            items: data.items,
            // the rental hours usually required in TRUCK_RENTAL
            estimatedHours: data.rentalDetails?.rentalDurationHours || estimate.estimatedHours || 0,
            rentalDurationHours: data.rentalDetails?.rentalDurationHours || 1,
            withDriver: true,
            extraStaffCount: data.rentalDetails?.extraStaffCount || 0
          };

          // Override fallback staff for truck rental?
          // Sometimes truck rental just wants to rent the truck
          // but if they added items, we calculate accordingly.
          
          const pricingResult = await PricingCalculationService.calculatePricing(mockSurveyData, activePriceList, 'TRUCK_RENTAL');
          estimatedPrice = pricingResult.totalPrice;
        }
      } catch (error) {
        console.warn(`[TruckRentalStrategy] Could not calculate estimated price for ticket ${ticket._id}:`, error.message);
      }

      // 3. Save the initial SurveyData
      const surveyData = new SurveyData({
        requestTicketId: ticket._id,
        surveyType: 'ONLINE',
        status: 'COMPLETED',
        items: data.items,
        totalActualVolume: estimate.totalVolume,
        totalActualWeight: estimate.totalWeight,
        // Preference user's explicitly requested truck size if given for Rental
        suggestedVehicle: data.rentalDetails?.truckType || estimate.suggestedVehicle,
        suggestedStaffCount: estimate.suggestedStaffCount,
        distanceKm: estimate.distanceKm || 0,
        estimatedPrice: estimatedPrice
      });
      
      await surveyData.save();
    }
  }

  async handleApproval(ticket, approverId, additionalData, io) {
    // For TRUCK_RENTAL, we want Head Dispatcher to accept and set personnel directly.
    // ApproverId is expected to be the Head Dispatcher who calls approveTicket.
    // Transition ticket into WAITING_REVIEW and assign approver as dispatcher to skip district auto-assignment.
    await TicketStateMachine.transition(ticket, 'WAITING_REVIEW');
    await NotificationService.createNotification(
      {
        userId: ticket.customerId,
        ...T.ORDER_ACCEPTED_TRUCK_RENTAL(),
        ticketId: ticket._id
      },
      io
    );
    return ticket;
  }
}

module.exports = TruckRentalStrategy;
