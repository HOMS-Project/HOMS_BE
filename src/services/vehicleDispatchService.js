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
      '500KG': { maxWeight: 500, maxVolume: 5 },
      '1TON': { maxWeight: 1000, maxVolume: 10 },
      '1.5TON': { maxWeight: 1500, maxVolume: 15 },
      '2TON': { maxWeight: 2000, maxVolume: 20 }
    };
    const vehicleTypes = ['500KG', '1TON', '1.5TON', '2TON'];

    // Step 1: find the smallest single vehicle that can carry the entire load
    for (const vehicleType of vehicleTypes) {
      const spec = VEHICLE_SPECS[vehicleType];
      if (totalWeight <= spec.maxWeight && totalVolume <= spec.maxVolume) {
        return [{ vehicleType, count: 1 }];
      }
    }

    // Step 2: load exceeds even the largest vehicle — use multiples of 2TON
    const largestSpec = VEHICLE_SPECS['2TON'];
    const count = Math.ceil(Math.max(
      totalWeight / largestSpec.maxWeight,
      totalVolume / largestSpec.maxVolume
    ));
    return [{ vehicleType: '2TON', count }];
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
   * Gán drivers & helpers cho xe, hỗ trợ leaderId
   */
  async assignStaff(vehicleId, leaderId, driverIds, staffIds) {
    try {
      let allDriverIds = [...(driverIds || [])];
      if (leaderId && !allDriverIds.includes(leaderId)) {
        allDriverIds.push(leaderId);
      }

      // Kiểm tra user tồn tại
      const drivers = await User.find({ _id: { $in: allDriverIds } });
      const staff = await User.find({ _id: { $in: staffIds || [] } });

      if (drivers.length !== allDriverIds.length) {
        throw new AppError('Some drivers not found', 404);
      }

      if (staff.length !== (staffIds?.length || 0)) {
        throw new AppError('Some staff not found', 404);
      }

      let roles = [];
      if (leaderId) roles.push('TEAM_LEADER');
      if (driverIds && driverIds.length > 0) roles.push('DRIVER');
      if (staffIds && staffIds.length > 0) roles.push('HELPER');

      return {
        vehicleId,
        driverIds: allDriverIds,
        staffIds,
        staffCount: (staffIds?.length || 0) + allDriverIds.length,
        staffRole: roles.length > 0 ? roles : ['HELPER']
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
      const invoice = await Invoice.findById(invoiceId)
        .populate('requestTicketId', 'pickup delivery scheduledTime');
      if (!invoice) {
        throw new AppError('Invoice not found', 404);
      }

      const ticket = invoice.requestTicketId;  // populated RequestTicket

      let assignment = await DispatchAssignment.findOne({ invoiceId });
      if (!assignment) {
        assignment = new DispatchAssignment({ invoiceId });
      }

      // Tính toán phương tiện cần thiết HOẶC sử dụng chỉ định thủ công
      let vehicleNeeds;
      if (dispatchData.vehicleType && dispatchData.vehicleCount) {
        vehicleNeeds = [{ vehicleType: dispatchData.vehicleType, count: parseInt(dispatchData.vehicleCount) }];
      } else {
        vehicleNeeds = await this.calculateVehicleNeeds(
          dispatchData.totalWeight,
          dispatchData.totalVolume
        );
      }

      assignment.assignments = [];
      let totalCapacity = 0;
      let totalStaff = 0;

      // Gán xe & nhân sự
      for (const need of vehicleNeeds) {
        const vehicles = await this.findAvailableVehicles(need.vehicleType, need.count);

        for (const vehicle of vehicles) {
          // Kiểm tra tuyến đường
          const targetRouteId = dispatchData.routeId || invoice.routeId;
          const validation = await RouteValidationService.validateRoute(
            targetRouteId,
            {
              vehicleType: need.vehicleType,
              totalWeight: dispatchData.totalWeight,
              totalVolume: dispatchData.totalVolume,
              pickupTime: invoice.scheduledTime || ticket?.scheduledTime || new Date(),
              deliveryTime: new Date((invoice.scheduledTime || ticket?.scheduledTime || new Date()).getTime() + 8 * 3600000),
              pickupAddress: ticket?.pickup?.address || '',
              deliveryAddress: ticket?.delivery?.address || ''
            }
          );

          if (!validation.isValid) {
            throw new AppError(
              `Route validation failed: ${validation.violations.join(', ')}`,
              400
            );
          }

          // Gán drivers & helpers (truyền leaderId)
          const staffAssignment = await this.assignStaff(
            vehicle._id,
            dispatchData.leaderId,
            dispatchData.driverIds || [],
            dispatchData.staffIds || []
          );

          const assignmentRecord = {
            vehicleId: vehicle._id,
            driverIds: staffAssignment.driverIds,
            staffIds: staffAssignment.staffIds,
            staffCount: staffAssignment.staffCount,
            staffRole: staffAssignment.staffRole,
            pickupTime: invoice.scheduledTime || new Date(),
            deliveryTime: new Date((invoice.scheduledTime || new Date()).getTime() + 8 * 3600000),
            estimatedDuration: dispatchData.estimatedDuration || 480, // 8 giờ
            loadWeight: dispatchData.totalWeight,
            loadVolume: dispatchData.totalVolume,
            capacityStatus: this.determineCapacityStatus(
              need.vehicleType,
              dispatchData.totalWeight
            ),
            routeId: targetRouteId,
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
      if (dispatchData.routeId) {
        invoice.routeId = dispatchData.routeId;
      }
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
      '500KG': { maxWeight: 500 },
      '1TON': { maxWeight: 1000 },
      '1.5TON': { maxWeight: 1500 },
      '2TON': { maxWeight: 2000 }
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
      '500KG': 500,
      '1TON': 1000,
      '1.5TON': 1500,
      '2TON': 2000
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
