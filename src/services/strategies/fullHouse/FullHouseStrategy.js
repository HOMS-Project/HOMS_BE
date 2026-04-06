const BaseStrategy = require('../BaseStrategy');
const AppError = require('../../../utils/appErrors');
const NotificationService = require('../../notificationService');
const SurveyData = require('../../../models/SurveyData');
const TicketStateMachine = require('../../TicketStateMachine');

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
      WAITING_SURVEY: ['SURVEYED', 'CANCELLED'],
      SURVEYED: ['QUOTED', 'CANCELLED'],
      QUOTED: ['ACCEPTED', 'CANCELLED'],
      ACCEPTED: ['CONVERTED', 'CANCELLED'],
      CONVERTED: [],
      CANCELLED: []
    };
    return transitions[currentStatus] || [];
  }

  async handleApproval(ticket, approverId, additionalData, io) {
    const { surveyorId } = additionalData;

    if (!surveyorId) {
      throw new AppError('Đơn chuyển nhà yêu cầu chọn nhân viên khảo sát khi duyệt', 400);
    }
    await TicketStateMachine.transition(ticket, 'WAITING_SURVEY', { 
      payload: { dispatcherId: surveyorId }
    });

    await NotificationService.createNotification(
      {
        userId: ticket.customerId,
        title: 'Đơn hàng của bạn đã được xác nhận',
        message: 'Nhân viên khảo sát đã được phân công. Vui lòng chờ lịch hẹn khảo sát.',
        type: 'System',
        ticketId: ticket._id
      },
      io
    );

    return ticket;
  }
}

module.exports = FullHouseStrategy;
