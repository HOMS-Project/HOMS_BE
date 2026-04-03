const FullHouseStrategy = require('./fullHouse/FullHouseStrategy');
const ItemMovingStrategy = require('./itemMoving/ItemMovingStrategy');
const TruckRentalStrategy = require('./truckRental/TruckRentalStrategy');
const AppError = require('../../utils/appErrors');

class StrategyFactory {
  static getStrategy(moveType) {
    switch (moveType) {
      case 'FULL_HOUSE':
        return new FullHouseStrategy();
      case 'SPECIFIC_ITEMS':
        return new ItemMovingStrategy();
      case 'TRUCK_RENTAL':
        return new TruckRentalStrategy();
      default:
        throw new AppError(`moveType không hợp lệ hoặc chưa được hỗ trợ: ${moveType}`, 400);
    }
  }
}

module.exports = StrategyFactory;
