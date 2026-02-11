const mongoose = require('mongoose');

const dispatchAssignmentSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },

  // Chi tiết điều phối
  assignments: [{
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: true
    },

    driverIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],

    staffIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],

    // Trạng thái nhân sự
    staffCount: Number,
    staffRole: [String],           // 'DRIVER', 'HELPER', 'SPECIALIST'

    // Lịch trình chi tiết
    pickupTime: Date,
    deliveryTime: Date,
    estimatedDuration: Number,     // phút

    // Kiểm tra khả năng chở
    loadWeight: Number,            // kg (khối lượng sử dụng)
    loadVolume: Number,            // m3
    capacityStatus: {
      type: String,
      enum: ['UNDERUTILIZED', 'OPTIMAL', 'FULL', 'OVERLOAD']
    },

    // Tuyến đường được chọn
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route'
    },
    routeValidation: {
      isValid: Boolean,
      violations: [String],        // Danh sách vi phạm (cấm xe, quá tải, etc.)
      warnings: [String],          // Cảnh báo (giờ cao điểm, thời tiết)
      notes: String
    },

    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING'
    },

    assignedAt: Date,
    confirmedAt: Date,
    completedAt: Date
  }],

  // Tóm tắt
  totalVehicles: Number,
  totalStaff: Number,
  totalCapacity: Number,          // kg

  status: {
    type: String,
    enum: ['DRAFT', 'ASSIGNED', 'CONFIRMED', 'IN_DISPATCH', 'COMPLETED'],
    default: 'DRAFT'
  },

  notes: String

}, { timestamps: true });

module.exports = mongoose.model('DispatchAssignment', dispatchAssignmentSchema);
