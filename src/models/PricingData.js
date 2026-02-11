const mongoose = require('mongoose');

const pricingDataSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },

  // Dữ liệu cơ bản
  estimatedDistance: Number,      // km
  totalWeight: Number,            // kg
  totalVolume: Number,            // m3

  // Giá cơ bản
  basePrice: Number,              // Giá theo distance/weight/volume

  // Dịch vụ bổ sung
  services: {
    packing: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [{ type: mongoose.Schema.Types.ObjectId }],
      price: Number
    },
    assembling: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [{ type: mongoose.Schema.Types.ObjectId }],
      price: Number
    },
    insurance: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [{ type: mongoose.Schema.Types.ObjectId }],
      price: Number
    },
    photography: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [{ type: mongoose.Schema.Types.ObjectId }],
      price: Number
    }
  },

  // Nhân sự
  staffFee: {
    count: Number,
    pricePerPerson: Number,
    totalStaffFee: Number
  },

  // Phương tiện
  vehicleFee: {
    vehicleType: String,
    pricePerDay: Number,
    pricePerHour: Number,
    totalVehicleFee: Number
  },

  // Phụ phí & khuyến mãi
  surcharge: Number,              // Phụ phí (hẻm hẹp, tầng cao, etc.)
  
  promotionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Promotion'
  },
  discountCode: String,
  discountAmount: Number,
  discountPercent: Number,

  // Tính toán cuối cùng
  subtotal: Number,               // Tổng trước thuế
  tax: Number,                    // Thuế VAT
  totalPrice: Number,             // Tổng giá tiền

  // Lịch sử tính giá
  calculatedAt: Date,
  calculatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Ghi chú
  notes: String

}, { timestamps: true });

module.exports = mongoose.model('PricingData', pricingDataSchema);
