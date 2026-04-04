const BaseStrategy = require('../BaseStrategy');
const AppError = require('../../../utils/appErrors');

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
  }

  getAllowedTransitions(currentStatus) {
    // TRUCK_RENTAL skips survey — goes to district dispatcher review after HD approval
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

module.exports = TruckRentalStrategy;
