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
    // Truck Rental generally skips SURVEYED flow, straight to QUOTED.
    const transitions = {
      CREATED: ['QUOTED', 'CANCELLED'],
      QUOTED: ['ACCEPTED', 'CANCELLED'],
      ACCEPTED: ['CONVERTED', 'CANCELLED'],
      CONVERTED: [],
      CANCELLED: []
    };
    return transitions[currentStatus] || [];
  }
}

module.exports = TruckRentalStrategy;
