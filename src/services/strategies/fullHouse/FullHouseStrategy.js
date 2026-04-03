const BaseStrategy = require('../BaseStrategy');
const AppError = require('../../../utils/appErrors');

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
}

module.exports = FullHouseStrategy;
