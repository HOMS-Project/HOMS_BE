/**
 * Service kiểm tra tuyến đường
 * - Kiểm tra giờ cấm, khu vực cấm
 * - Kiểm tra quá tải (weight/volume)
 * - Gợi ý tuyến đường phù hợp
 * - Kiểm tra loại xe có hợp lệ không
 */

const Route = require('../models/Route');
const Vehicle = require('../models/Vehicle');
const AppError = require('../utils/appErrors');

class RouteValidationService {
  /**
   * Kiểm tra xem tuyến đường có hợp lệ cho chuyến này không
   */
  async validateRoute(routeId, {
    vehicleType,
    totalWeight,
    totalVolume,
    pickupTime,
    deliveryTime,
    pickupAddress,
    deliveryAddress
  }) {
    try {
      const route = await Route.findById(routeId);
      if (!route) {
        throw new AppError('Route not found', 404);
      }

      const violations = [];
      const warnings = [];

      // ===== 1. Kiểm tra loại xe =====
      const vehicleViolation = this.checkVehicleType(route, vehicleType);
      if (vehicleViolation) violations.push(vehicleViolation);

      // ===== 2. Kiểm tra giờ cấm & quy định giao thông =====
      const trafficIssues = this.checkTrafficRules(route, pickupTime, vehicleType);
      violations.push(...trafficIssues.violations);
      warnings.push(...trafficIssues.warnings);

      // ===== 3. Kiểm tra khả năng chở (weight/volume) =====
      const capacityIssue = await this.checkCapacity(vehicleType, totalWeight, totalVolume);
      if (capacityIssue) violations.push(capacityIssue);

      // ===== 4. Kiểm tra khoảng cách hợp lý =====
      // TODO: Tích hợp với Google Maps API hoặc service tính distance

      const isValid = violations.length === 0;

      return {
        isValid,
        routeId,
        vehicleType,
        violations,
        warnings,
        surcharge: route.routeSurcharge || 0,
        discountRate: route.routeDiscountRate || 0,
        recommendedStaff: route.recommendedStaff
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Kiểm tra loại xe có được phép chạy trên tuyến này không
   */
  checkVehicleType(route, vehicleType) {
    if (route.compatibleVehicles && route.compatibleVehicles.length > 0) {
      const compatible = route.compatibleVehicles.includes(vehicleType);
      if (!compatible) {
        return `Vehicle type "${vehicleType}" is not compatible with route "${route.code}"`;
      }
    }
    return null;
  }

  /**
   * Kiểm tra giờ cấm, cao điểm, cấm xe
   */
  checkTrafficRules(route, pickupTime, vehicleType) {
    const violations = [];
    const warnings = [];

    if (!route.trafficRules || route.trafficRules.length === 0) {
      return { violations, warnings };
    }

    const pickupHour = pickupTime.getHours();
    const pickupDay = pickupTime.toLocaleDateString('en-US', { weekday: 'long' });

    for (const rule of route.trafficRules) {
      // Kiểm tra ngày trong tuần
      if (rule.daysOfWeek && !rule.daysOfWeek.includes(pickupDay)) {
        continue;
      }

      // Kiểm tra thời gian
      const [startHour] = rule.startTime.split(':').map(Number);
      const [endHour] = rule.endTime.split(':').map(Number);

      if (pickupHour < startHour || pickupHour >= endHour) {
        continue;
      }

      // Nếu đã vào thời gian quy định
      if (rule.restrictedVehicles && rule.restrictedVehicles.includes(vehicleType)) {
        if (rule.ruleType === 'TRUCK_BAN') {
          violations.push(
            `Vehicle type "${vehicleType}" is banned on this route during ${rule.startTime}-${rule.endTime}`
          );
        } else {
          warnings.push(
            `Warning: Peak hour or restricted time (${rule.startTime}-${rule.endTime}). May cause delays.`
          );
        }
      }
    }

    return { violations, warnings };
  }

  /**
   * Kiểm tra xe có thể chở được không (quá tải)
   */
  async checkCapacity(vehicleType, totalWeight, totalVolume) {
    const VEHICLE_SPECS = {
      'SMALL_TRUCK': { maxWeight: 1000, maxVolume: 10 },      // 1T, 10m3
      'MEDIUM_TRUCK': { maxWeight: 2500, maxVolume: 20 },     // 2.5T, 20m3
      'LARGE_TRUCK': { maxWeight: 5000, maxVolume: 40 },      // 5T, 40m3
      'VAN': { maxWeight: 1500, maxVolume: 15 }               // 1.5T, 15m3
    };

    const specs = VEHICLE_SPECS[vehicleType];
    if (!specs) {
      return `Unknown vehicle type: ${vehicleType}`;
    }

    if (totalWeight > specs.maxWeight) {
      return `Total weight (${totalWeight}kg) exceeds vehicle capacity (${specs.maxWeight}kg)`;
    }

    if (totalVolume > specs.maxVolume) {
      return `Total volume (${totalVolume}m3) exceeds vehicle capacity (${specs.maxVolume}m3)`;
    }

    return null;
  }

  /**
   * Tìm tuyến đường phù hợp nhất cho delivery
   */
  async findOptimalRoute({
    pickupCoords,
    deliveryCoords,
    vehicleType,
    totalWeight,
    totalVolume,
    pickupTime
  }) {
    try {
      const routes = await Route.find({ isActive: true });

      const validRoutes = [];

      for (const route of routes) {
        const validation = await this.validateRoute(route._id, {
          vehicleType,
          totalWeight,
          totalVolume,
          pickupTime,
          pickupAddress: '', // TODO: Lấy từ invoice
          deliveryAddress: ''
        });

        if (validation.isValid) {
          validRoutes.push({
            ...route.toObject(),
            validation
          });
        }
      }

      // Sắp xếp theo surcharge (thấp nhất trước)
      validRoutes.sort((a, b) => a.validation.surcharge - b.validation.surcharge);

      return validRoutes;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cảnh báo nếu có vấn đề với tuyến đường
   */
  getRouteWarnings(validation) {
    const warnings = [];

    if (validation.violations.length > 0) {
      warnings.push(`CRITICAL: ${validation.violations.length} violations found`);
    }

    if (validation.warnings.length > 0) {
      warnings.push(`INFO: ${validation.warnings.join('; ')}`);
    }

    return warnings;
  }
}

module.exports = new RouteValidationService();
