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
    // SPECIFIC_ITEMS skips survey — goes to district dispatcher review after HD approval
    const transitions = {
      CREATED:           ['WAITING_REVIEW', 'CANCELLED'],
      WAITING_REVIEW:    ['QUOTED', 'CANCELLED'],
      ASSIGNMENT_FAILED: ['WAITING_REVIEW', 'CANCELLED'], // Head dispatcher reassigns manually
      QUOTED:            ['ACCEPTED', 'CANCELLED'],
      ACCEPTED:          ['CONVERTED', 'CANCELLED'],
      CONVERTED:         [],
      CANCELLED:         []
    };
    return transitions[currentStatus] || [];
  }
}

module.exports = ItemMovingStrategy;
