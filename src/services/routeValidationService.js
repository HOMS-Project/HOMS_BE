/**
 * Service kiểm tra tuyến đường
 * - Kiểm tra giờ cấm, khu vực cấm
 * - Kiểm tra quá tải (weight/volume)
 * - Gợi ý tuyến đường phù hợp
 * - Kiểm tra loại xe có hợp lệ không
 */

const Route = require('../models/Route');
const Vehicle = require('../models/Vehicle');
const polyline = require('@mapbox/polyline');
const turf = require('@turf/turf');
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
    deliveryAddress,
    polyline: polylineEncoded,
    skipCapacity = false
  }) {
    try {
      const violations = [];
      const warnings = [];

      // ===== 3. Kiểm tra khả năng chở (weight/volume) =====
      if (!skipCapacity) {
        const capacityIssue = await this.checkCapacity(vehicleType, totalWeight, totalVolume);
        if (capacityIssue) violations.push(capacityIssue);
      }

      // ===== Try to load a pre-configured route for extra rule checks =====
      // For a moving company, routes are customer-defined (dynamic) so routeId is
      // often null. In that case we skip the DB-backed rule checks and just validate
      // capacity + time, which is good enough for dispatch assignment.
      if (routeId) {
        const route = await Route.findById(routeId);
        if (route) {
          // ===== 1. Kiểm tra loại xe =====
          const vehicleViolation = this.checkVehicleType(route, vehicleType);
          if (vehicleViolation) violations.push(vehicleViolation);

          // ===== 2. Kiểm tra giờ cấm & quy định giao thông =====
          const trafficIssues = this.checkTrafficRules(route, pickupTime, vehicleType);
          violations.push(...trafficIssues.violations);
          warnings.push(...trafficIssues.warnings);

          // ===== 3. Kiểm tra khả năng chở (weight/volume) =====
          if (!skipCapacity) {
            const capacityIssue = await this.checkCapacity(vehicleType, totalWeight, totalVolume);
            if (capacityIssue) violations.push(capacityIssue);
          }

          // ===== 4. Kiểm tra khoảng cách hợp lý =====
          // TODO: Tích hợp với Google Maps API hoặc service tính distance

          // ===== 5. Kiểm tra các hạn chế cấp độ đường phố (Road Restrictions) =====
          const streetRestrictions = await this.checkStreetLevelRestrictions(polylineEncoded, vehicleType, route.roadRestrictions);
          violations.push(...streetRestrictions.violations);
          warnings.push(...streetRestrictions.warnings);

          const isValid = violations.length === 0;
          return {
            isValid,
            routeId,
            vehicleType,
            violations,
            warnings,
            restrictedSegments: streetRestrictions.restrictedSegments,
            surcharge: route.routeSurcharge || 0,
            discountRate: route.routeDiscountRate || 0,
            recommendedStaff: route.recommendedStaff
          };
        }
      }

      // ===== Dynamic route (no pre-seeded DB route) =====
      // Warn about peak hours based on pickup time even without a configured route
      if (pickupTime) {
        const hour = new Date(pickupTime).getHours();
        if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) {
          warnings.push(`Pickup during peak hours (${hour}:00). Expect delays.`);
        }
      }

      const isValid = violations.length === 0;
      return {
        isValid,
        routeId: null,
        vehicleType,
        violations,
        warnings,
        surcharge: 0,
        discountRate: 0,
        recommendedStaff: null
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
      '500KG': { maxWeight: 500, maxVolume: 5 },
      '1TON': { maxWeight: 1000, maxVolume: 10 },
      '1.5TON': { maxWeight: 1500, maxVolume: 15 },
      '2TON': { maxWeight: 2000, maxVolume: 20 }
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
   * Kiểm tra các hạn chế cấp độ đường phố (Road Restrictions) dọc theo polyline
   * @param {string} polylineEncoded 
   * @param {string} vehicleType 
   * @param {any[]} roadRestrictions
   * @returns {Promise<{violations: string[], warnings: string[], restrictedSegments: any[]}>}
   */
  async checkStreetLevelRestrictions(polylineEncoded, vehicleType, roadRestrictions = []) {
    const violations = [];
    const warnings = [];
    const restrictedSegments = [];

    if (!polylineEncoded || roadRestrictions.length === 0) {
      return { violations, warnings, restrictedSegments };
    }

    try {
      // Decode polyline: [[lat, lng], ...]
      const decodedPoints = polyline.decode(polylineEncoded);
      
      // Convert to GeoJSON coordinates: [[lng, lat], ...]
      const pathCoords = decodedPoints.map(p => [p[1], p[0]]);

      for (const restriction of roadRestrictions) {
        if (!restriction.isActive) continue;

        const isMatched = this._checkIntersection(pathCoords, restriction.geometry.coordinates);

        if (isMatched) {
          if (restriction.severity === 'AVOID' || restriction.restrictionType === 'CLOSED') {
            violations.push(`CẢNH BÁO CẤM: ${restriction.roadName} - ${restriction.description || restriction.restrictionType}`);
          } else {
            warnings.push(`LƯU Ý: ${restriction.roadName} - ${restriction.description || restriction.restrictionType}`);
          }
          restrictedSegments.push({
            roadName: restriction.roadName,
            restrictionType: restriction.restrictionType,
            severity: restriction.severity,
            description: restriction.description
          });
        }
      }

      return { violations, warnings, restrictedSegments };
    } catch (error) {
      console.error('[RouteValidationService] Polyline check failed:', error);
      return { violations, warnings, restrictedSegments };
    }
  }

  /**
   * Helper kiểm tra giao diện giữa 2 mảng tọa độ sử dụng turf.js
   */
  _checkIntersection(pathCoords, restrictedCoords) {
    try {
      if (!pathCoords || pathCoords.length < 2 || !restrictedCoords || restrictedCoords.length < 2) {
        return false;
      }

      const pathLine = turf.lineString(pathCoords);
      const restrictedLine = turf.lineString(restrictedCoords);

      // 1. Kiểm tra xem 2 line có giao nhau không
      const intersects = turf.lineIntersect(pathLine, restrictedLine);
      if (intersects.features.length > 0) {
        return true;
      }

      // 2. Kiểm tra xem 2 line có nằm quá gần nhau không (buffer check)
      // Tạo một vùng đệm (buffer) 50 mét quanh đoạn đường bị hạn chế
      const buffer = turf.buffer(restrictedLine, 0.05, { units: 'kilometers' });
      
      // Kiểm tra xem bất kỳ điểm nào của path có nằm trong buffer không
      const points = turf.explode(pathLine);
      for (const point of points.features) {
        if (turf.booleanPointInPolygon(point, buffer)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[RouteValidationService] Intersection check failed:', error);
      return false;
    }
  }
}

module.exports = new RouteValidationService();
