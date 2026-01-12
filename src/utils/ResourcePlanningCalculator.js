/**
 * Resource Planning Helper
 * 
 * Logic phân bổ xe, nhân lực dựa trên ràng buộc thời gian
 * 
 * Bài toán:
 * - Pickup A → Travel → Delivery B
 * - Total time required = pickup_time + travel_time + delivery_time
 * - Time available = deadline - current_time
 * 
 * Các strategy:
 * 1. SINGLE_VEHICLE: 1 xe đi qua 3 bước (đủ thời gian)
 * 2. PARALLEL_PICKUP_DELIVERY: 2 xe (1 pickup tại A, 1 giao tại B song song)
 * 3. STAGGERED: 3 hoặc nhiều xe (pickup → transfer → delivery)
 */

class ResourcePlanningCalculator {
  /**
   * Tính số xe cần thiết dựa trên thời gian
   * 
   * @param {Object} params
   * @param {Date} params.currentTime - Thời gian hiện tại
   * @param {Date} params.deliveryDeadline - Deadline giao hàng
   * @param {Number} params.estimatedPickupTime - Thời gian lấy hàng (phút)
   * @param {Number} params.travelTime - Thời gian vận chuyển (phút)
   * @param {Number} params.estimatedDeliveryTime - Thời gian giao hàng (phút)
   * 
   * @returns {Object} {vehiclesNeeded, strategyUsed, timeAnalysis, notes}
   */
  static calculateResourceNeeds(params) {
    const {
      currentTime = new Date(),
      deliveryDeadline,
      estimatedPickupTime = 30,
      travelTime,
      estimatedDeliveryTime = 30
    } = params;

    // Tính thời gian khả dụng (phút)
    const timeAvailable = (deliveryDeadline - currentTime) / (1000 * 60);

    // Tính tổng thời gian cần thiết (phút)
    const totalTimeRequired = estimatedPickupTime + travelTime + estimatedDeliveryTime;

    // Tính buffer (10% để an toàn)
    const requiredTimeWithBuffer = totalTimeRequired * 1.1;

    let vehiclesNeeded = 1;
    let strategyUsed = 'SINGLE_VEHICLE';
    let notes = '';

    // Phân tích và quyết định strategy
    if (timeAvailable >= requiredTimeWithBuffer) {
      // TH2: Thời gian thoáng, 1 xe đủ
      vehiclesNeeded = 1;
      strategyUsed = 'SINGLE_VEHICLE';
      notes = `Thời gian khả dụng: ${Math.round(timeAvailable)}p, cần: ${Math.round(requiredTimeWithBuffer)}p. 1 xe đủ.`;

    } else if (timeAvailable >= (travelTime + Math.max(estimatedPickupTime, estimatedDeliveryTime) * 1.1)) {
      // TH1: Thời gian hạn chế, dùng 2 xe song song
      // - Xe 1: pickup tại A (30p) + travel (60p) = 90p
      // - Xe 2: waiting + delivery tại B (30p)
      // - Total: ~90p (thay vì 120p)
      vehiclesNeeded = 2;
      strategyUsed = 'PARALLEL_PICKUP_DELIVERY';
      notes = `Thời gian hạn chế: ${Math.round(timeAvailable)}p < ${Math.round(requiredTimeWithBuffer)}p. Cần 2 xe: pickup+travel song song với delivery.`;

    } else {
      // TH3: Thời gian rất hạn chế, cần 3+ xe hoặc không khả thi
      // Strategy: STAGGERED - xe relay (xe 1 pickup, transfer cho xe 2, xe 2 delivery)
      vehiclesNeeded = 3;
      strategyUsed = 'STAGGERED';
      notes = `Thời gian quá hạn chế: ${Math.round(timeAvailable)}p. Cần ${vehiclesNeeded} xe (relay). Khách hàng cần xác nhận deadline.`;
    }

    return {
      vehiclesNeeded,
      strategyUsed,
      timeAnalysis: {
        currentTime,
        deliveryDeadline,
        timeAvailable: Math.round(timeAvailable),
        estimatedPickupTime,
        travelTime,
        estimatedDeliveryTime,
        totalTimeRequired: Math.round(totalTimeRequired),
        requiredTimeWithBuffer: Math.round(requiredTimeWithBuffer)
      },
      notes,
      feasible: vehiclesNeeded <= 3 // Giả sử không thể sử dụng > 3 xe
    };
  }

  /**
   * Tính số nhân công cần thiết
   * 
   * @param {Object} params
   * @param {Number} params.totalWeight - Tổng trọng lượng (kg)
   * @param {Number} params.totalVolume - Tổng thể tích (m³)
   * @param {Number} params.vehiclesNeeded - Số xe
   * @param {Boolean} params.hasService - Có dịch vụ đóng gói/tháo lắp
   * 
   * @returns {Object} {staffCount, notes}
   */
  static calculateStaffNeeds(params) {
    const {
      totalWeight = 0,
      totalVolume = 0,
      vehiclesNeeded = 1,
      hasService = false
    } = params;

    let baseStaff = 2; // Mỗi xe cần tối thiểu 1-2 người

    // Tăng nhân công dựa trên trọng lượng
    if (totalWeight > 500) baseStaff = 3; // 500kg+: 3 người
    if (totalWeight > 1000) baseStaff = 4; // 1000kg+: 4 người
    if (totalWeight > 2000) baseStaff = 5; // 2000kg+: 5 người

    // Tăng nhân công dựa trên số xe
    let staffPerVehicle = baseStaff;
    if (vehiclesNeeded === 2) staffPerVehicle = baseStaff + 1; // Song song -> cần thêm người
    if (vehiclesNeeded === 3) staffPerVehicle = baseStaff + 2; // Relay -> cần thêm người

    const totalStaff = vehiclesNeeded * staffPerVehicle;

    let notes = `${vehiclesNeeded} xe × ${staffPerVehicle} người/xe = ${totalStaff} người`;
    if (hasService) {
      notes += ` (+ có dịch vụ đóng gói/tháo lắp)`;
    }

    return {
      staffCount: totalStaff,
      staffPerVehicle,
      notes
    };
  }

  /**
   * Tạo timeline thực hiện cho mỗi vehicle
   */
  static createExecutionTimeline(params) {
    const {
      currentTime = new Date(),
      estimatedPickupTime = 30,
      travelTime,
      estimatedDeliveryTime = 30,
      vehiclesNeeded = 1,
      strategyUsed = 'SINGLE_VEHICLE'
    } = params;

    const timelines = [];

    if (strategyUsed === 'SINGLE_VEHICLE') {
      // 1 xe: pickup → travel → delivery
      const pickupEnd = new Date(currentTime.getTime() + estimatedPickupTime * 60000);
      const travelEnd = new Date(pickupEnd.getTime() + travelTime * 60000);
      const deliveryEnd = new Date(travelEnd.getTime() + estimatedDeliveryTime * 60000);

      timelines.push({
        vehicleNo: 1,
        pickupStart: currentTime,
        pickupEnd,
        travelStart: pickupEnd,
        travelEnd,
        deliveryStart: travelEnd,
        deliveryEnd,
        totalDuration: estimatedPickupTime + travelTime + estimatedDeliveryTime
      });

    } else if (strategyUsed === 'PARALLEL_PICKUP_DELIVERY') {
      // 2 xe: pickup song song với delivery
      const pickupEnd = new Date(currentTime.getTime() + estimatedPickupTime * 60000);
      const travelEnd = new Date(pickupEnd.getTime() + travelTime * 60000);
      const deliveryEnd = new Date(travelEnd.getTime() + estimatedDeliveryTime * 60000);

      timelines.push({
        vehicleNo: 1,
        task: 'PICKUP_AND_TRAVEL',
        start: currentTime,
        pickupEnd,
        travelEnd,
        duration: estimatedPickupTime + travelTime
      });

      timelines.push({
        vehicleNo: 2,
        task: 'WAIT_AND_DELIVERY',
        start: travelEnd, // Xe 2 chờ tới lúc xe 1 tới điểm giao
        deliveryStart: travelEnd,
        deliveryEnd,
        duration: estimatedDeliveryTime
      });

    } else if (strategyUsed === 'STAGGERED') {
      // 3 xe: pickup → transfer point 1 → transfer point 2 → delivery
      const pickupEnd = new Date(currentTime.getTime() + estimatedPickupTime * 60000);
      const transfer1Time = new Date(pickupEnd.getTime() + (travelTime / 2) * 60000);
      const transfer2Time = new Date(transfer1Time.getTime() + (travelTime / 2) * 60000);
      const deliveryEnd = new Date(transfer2Time.getTime() + estimatedDeliveryTime * 60000);

      timelines.push({
        vehicleNo: 1,
        task: 'PICKUP_AND_PARTIAL_TRAVEL',
        start: currentTime,
        end: transfer1Time,
        duration: estimatedPickupTime + (travelTime / 2)
      });

      timelines.push({
        vehicleNo: 2,
        task: 'RELAY_TRANSPORT',
        start: transfer1Time,
        end: transfer2Time,
        duration: travelTime / 2
      });

      timelines.push({
        vehicleNo: 3,
        task: 'FINAL_DELIVERY',
        start: transfer2Time,
        end: deliveryEnd,
        duration: estimatedDeliveryTime
      });
    }

    return {
      strategyUsed,
      timelines
    };
  }
}

module.exports = ResourcePlanningCalculator;
