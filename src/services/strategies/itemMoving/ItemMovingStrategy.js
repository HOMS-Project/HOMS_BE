const BaseStrategy = require('../BaseStrategy');
const AppError = require('../../../utils/appErrors');

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
    // For Item Moving, survey steps can be lighter or skipped
    // Could bypass SURVEYED if AI handles it straight to QUOTED.
    // For now, keeping standard flow but allowing strict bypass if needed later.
    const transitions = {
      CREATED: ['WAITING_SURVEY', 'QUOTED', 'CANCELLED'],
      WAITING_SURVEY: ['SURVEYED', 'QUOTED', 'CANCELLED'],
      SURVEYED: ['QUOTED', 'CANCELLED'],
      QUOTED: ['ACCEPTED', 'CANCELLED'],
      ACCEPTED: ['CONVERTED', 'CANCELLED'],
      CONVERTED: [],
      CANCELLED: []
    };
    return transitions[currentStatus] || [];
  }
}

module.exports = ItemMovingStrategy;
