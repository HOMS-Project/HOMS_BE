const BaseStrategy = require('../BaseStrategy');
const AppError = require('../../../utils/appErrors');
const NotificationService = require('../../notificationService');
const T = require('../../../utils/notificationTemplates');
const SurveyData = require('../../../models/SurveyData');
const TicketStateMachine = require('../../TicketStateMachine');
const AutoAssignmentService = require('../../AutoAssignmentService');
const User = require('../../../models/User');

class FullHouseStrategy extends BaseStrategy {
  validateCreate(data) {
    if (!data.pickup?.address || !data.delivery?.address) {
      throw new AppError('Pickup và delivery address không được rỗng', 400);
    }
    if (data.pickup.address === data.delivery.address) {
      throw new AppError('Pickup và delivery phải khác nhau', 400);
    }
    // For Full House, survey time/details are usually required later, but basic details needed here.
  }

  async handlePostCreation(ticket, data) {
    // For FULL_HOUSE, we create an empty baseline SurveyData representing the future appointment
    const surveyData = new SurveyData({
      requestTicketId: ticket._id,
      surveyType: 'OFFLINE',
      status: 'SCHEDULED' // Default until actually scheduled
    });
    await surveyData.save();
  }

  getAllowedTransitions(currentStatus) {
    const transitions = {
      CREATED: ['WAITING_SURVEY', 'CANCELLED'],
      WAITING_SURVEY: ['SURVEYED', 'QUOTED', 'CANCELLED'],
      SURVEYED: ['QUOTED', 'CANCELLED'],
      QUOTED: ['ACCEPTED', 'CANCELLED'],
      ACCEPTED: ['CONVERTED', 'CANCELLED'],
      CONVERTED: [],
      CANCELLED: []
    };
    return transitions[currentStatus] || [];
  }

  async handleApproval(ticket, approverId, additionalData = {}, io) {
    let assignedDispatcherId = additionalData.surveyorId;

    if (!assignedDispatcherId) {
      assignedDispatcherId = await AutoAssignmentService.assignDispatcher(ticket);
    }

    if (assignedDispatcherId) {
      await TicketStateMachine.transition(ticket, 'WAITING_SURVEY', {
        payload: { dispatcherId: assignedDispatcherId }
      });

      await NotificationService.createNotification(
        {
          userId: ticket.customerId,
          ...T.ORDER_CONFIRMED_SURVEY_PENDING(),
          ticketId: ticket._id
        },
        io
      );
    } else {
      await TicketStateMachine.transition(ticket, 'ASSIGNMENT_FAILED', {
        comment: 'Auto assignment failed for surveyor.'
      });

      const headDispatchers = await User.find({
        role: 'dispatcher',
        'dispatcherProfile.isGeneral': true
      }).select('_id');

      for (const hd of headDispatchers) {
        await NotificationService.createNotification(
          {
            userId: hd._id,
            ...T.AUTO_ASSIGNMENT_FAILED_SURVEY({ ticketCode: ticket.code }),
            ticketId: ticket._id
          },
          io
        );
      }
    }

    return ticket;
  }
}

module.exports = FullHouseStrategy;
