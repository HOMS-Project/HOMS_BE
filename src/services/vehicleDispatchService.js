/**
 * Service điều phối xe & nhân sự
 * - Chọn xe thích hợp theo khả năng chở
 * - Gán drivers & helpers
 * - Kiểm tra khả năng có sẵn
 * - Hỗ trợ điều phối 1 hoặc nhiều xe
 */

const DispatchAssignment = require('../models/DispatchAssignment');
const Invoice = require('../models/Invoice');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const RouteValidationService = require('./routeValidationService');
const AppError = require('../utils/appErrors');

class VehicleDispatchService {
  /**
   * Tính toán & đề xuất phương tiện cần dùng
   */
  async calculateVehicleNeeds(totalWeight, totalVolume) {
    const VEHICLE_SPECS = {
      'SMALL_TRUCK': { maxWeight: 1000, maxVolume: 10, capacity: '1T' },
      'MEDIUM_TRUCK': { maxWeight: 2500, maxVolume: 20, capacity: '2.5T' },
      'LARGE_TRUCK': { maxWeight: 5000, maxVolume: 40, capacity: '5T' },
      'VAN': { maxWeight: 1500, maxVolume: 15, capacity: '1.5T' }
    };

    const requiredVehicles = [];
    let remainingWeight = totalWeight;
    let remainingVolume = totalVolume;

    // Sắp xếp từ nhỏ đến lớn để chọn xe tối ưu
    const vehicleTypes = ['SMALL_TRUCK', 'MEDIUM_TRUCK', 'LARGE_TRUCK', 'VAN'];

    for (const vehicleType of vehicleTypes) {
      const spec = VEHICLE_SPECS[vehicleType];

      // Nếu có thể chở toàn bộ với 1 xe loại này
      if (remainingWeight <= spec.maxWeight && remainingVolume <= spec.maxVolume) {
        requiredVehicles.push({ vehicleType, count: 1 });
        return requiredVehicles;
      }

      // Nếu không, dùng xe này rồi tiếp tục
      if (remainingWeight > 0 || remainingVolume > 0) {
        const vehiclesNeeded = Math.ceil(
          Math.max(
            remainingWeight / spec.maxWeight,
            remainingVolume / spec.maxVolume
          )
        );

        if (vehiclesNeeded > 0) {
          requiredVehicles.push({ vehicleType, count: vehiclesNeeded });
          remainingWeight = 0;
          remainingVolume = 0;
          break;
        }
      }
    }

    return requiredVehicles;
  }

  /**
   * Tìm xe sẵn sàng (available) và phù hợp với yêu cầu
   */
  async findAvailableVehicles(vehicleType, count = 1) {
    try {
      const vehicles = await Vehicle.find({
        vehicleType,
        status: 'Available',
        isActive: true
      }).limit(count);

      if (vehicles.length < count) {
        throw new AppError(
          `Not enough available ${vehicleType} vehicles. Need: ${count}, Available: ${vehicles.length}`,
          400
        );
      }

      return vehicles;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Gán drivers & helpers cho xe
   */
  async assignStaff(vehicleId, driverIds, staffIds, staffRole = []) {
    try {
      // Kiểm tra user tồn tại
      const drivers = await User.find({ _id: { $in: driverIds } });
      const staff = await User.find({ _id: { $in: staffIds } });

      if (drivers.length !== driverIds.length) {
        throw new AppError('Some drivers not found', 404);
      }

      if (staff.length !== staffIds.length) {
        throw new AppError('Some staff not found', 404);
      }

      return {
        vehicleId,
        driverIds,
        staffIds,
        staffCount: staffIds.length,
        staffRole: staffRole.length > 0 ? staffRole : ['HELPER']
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Tạo dispatch assignment cho invoice
   */
  async createDispatchAssignment(invoiceId, dispatchData) {
    try {
      const invoice = await Invoice.findById(invoiceId);
      if (!invoice) {
        throw new AppError('Invoice not found', 404);
      }

      let assignment = await DispatchAssignment.findOne({ invoiceId });
      if (!assignment) {
        assignment = new DispatchAssignment({ invoiceId });
      }

      // Tính toán phương tiện cần thiết
      const vehicleNeeds = await this.calculateVehicleNeeds(
        dispatchData.totalWeight,
        dispatchData.totalVolume
      );

      assignment.assignments = [];
      let totalCapacity = 0;
      let totalStaff = 0;

      // Gán xe & nhân sự
      for (const need of vehicleNeeds) {
        const vehicles = await this.findAvailableVehicles(need.vehicleType, need.count);

        for (const vehicle of vehicles) {
          // Kiểm tra tuyến đường
          const validation = await RouteValidationService.validateRoute(
            invoice.routeId,
            {
              vehicleType: need.vehicleType,
              totalWeight: dispatchData.totalWeight,
              totalVolume: dispatchData.totalVolume,
              pickupTime: invoice.scheduledTime,
              deliveryTime: new Date(invoice.scheduledTime.getTime() + 8 * 3600000),
              pickupAddress: invoice.pickup.address,
              deliveryAddress: invoice.delivery.address
            }
          );

          if (!validation.isValid) {
            throw new AppError(
              `Route validation failed: ${validation.violations.join(', ')}`,
              400
            );
          }

          // Gán drivers & helpers
          const staffAssignment = await this.assignStaff(
            vehicle._id,
            dispatchData.driverIds || [],
            dispatchData.staffIds || []
          );

          const assignmentRecord = {
            vehicleId: vehicle._id,
            driverIds: staffAssignment.driverIds,
            staffIds: staffAssignment.staffIds,
            staffCount: staffAssignment.staffCount,
            staffRole: staffAssignment.staffRole,
            pickupTime: invoice.scheduledTime,
            deliveryTime: new Date(invoice.scheduledTime.getTime() + 8 * 3600000),
            estimatedDuration: dispatchData.estimatedDuration || 480, // 8 giờ
            loadWeight: dispatchData.totalWeight,
            loadVolume: dispatchData.totalVolume,
            capacityStatus: this.determineCapacityStatus(
              need.vehicleType,
              dispatchData.totalWeight
            ),
            routeId: invoice.routeId,
            routeValidation: validation,
            status: 'PENDING',
            assignedAt: new Date()
          };

          assignment.assignments.push(assignmentRecord);
          totalCapacity += this.getVehicleCapacity(need.vehicleType);
          totalStaff += staffAssignment.staffCount;
        }
      }

      assignment.totalVehicles = assignment.assignments.length;
      assignment.totalStaff = totalStaff;
      assignment.totalCapacity = totalCapacity;
      assignment.status = 'ASSIGNED';

      await assignment.save();

      // Cập nhật invoice
      invoice.dispatchAssignmentId = assignment._id;
      invoice.status = 'ASSIGNED';
      await invoice.save();

      return assignment;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Xác nhận dispatch assignment
   */
  async confirmDispatchAssignment(assignmentId) {
    try {
      const assignment = await DispatchAssignment.findById(assignmentId);
      if (!assignment) {
        throw new AppError('Assignment not found', 404);
      }

      // Cập nhật tất cả assignment records thành CONFIRMED
      assignment.assignments.forEach(a => {
        a.status = 'CONFIRMED';
        a.confirmedAt = new Date();
      });

      assignment.status = 'CONFIRMED';
      await assignment.save();

      return assignment;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Xác định tình trạng capacity (Underutilized/Optimal/Full/Overload)
   */
  determineCapacityStatus(vehicleType, weight) {
    const VEHICLE_SPECS = {
      'SMALL_TRUCK': { maxWeight: 1000 },
      'MEDIUM_TRUCK': { maxWeight: 2500 },
      'LARGE_TRUCK': { maxWeight: 5000 },
      'VAN': { maxWeight: 1500 }
    };

    const maxWeight = VEHICLE_SPECS[vehicleType]?.maxWeight || 1000;
    const utilization = (weight / maxWeight) * 100;

    if (utilization < 30) return 'UNDERUTILIZED';
    if (utilization <= 85) return 'OPTIMAL';
    if (utilization <= 100) return 'FULL';
    return 'OVERLOAD';
  }

  /**
   * Lấy sức chở của xe
   */
  getVehicleCapacity(vehicleType) {
    const VEHICLE_SPECS = {
      'SMALL_TRUCK': 1000,
      'MEDIUM_TRUCK': 2500,
      'LARGE_TRUCK': 5000,
      'VAN': 1500
    };
    return VEHICLE_SPECS[vehicleType] || 0;
  }

  /**
   * Hủy/thay đổi dispatch
   */
  async updateDispatchAssignment(assignmentId, updateData) {
    try {
      const assignment = await DispatchAssignment.findById(assignmentId);
      if (!assignment) {
        throw new AppError('Assignment not found', 404);
      }

      // Chỉ có thể thay đổi nếu chưa xác nhận
      if (assignment.status !== 'DRAFT') {
        throw new AppError('Cannot modify confirmed assignment', 400);
      }

      // Cập nhật dữ liệu
      if (updateData.assignments) {
        assignment.assignments = updateData.assignments;
      }

      await assignment.save();
      return assignment;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Lấy dispatch assignment theo invoice
   */
  async getAssignmentByInvoice(invoiceId) {
    return DispatchAssignment.findOne({ invoiceId })
      .populate('assignments.vehicleId')
      .populate('assignments.driverIds')
      .populate('assignments.staffIds');
  }
}

module.exports = new VehicleDispatchService();
