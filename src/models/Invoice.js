const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  code: { type: String, unique: true },

  requestTicketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RequestTicket',
    required: true
  },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  dispatcherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  pickup: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  delivery: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  },

  scheduledTime: Date,

  scheduledTimeWindow: {
    startTime: String,
    endTime: String
  },

  deliveryDeadline: Date,

  moveType: {
    type: String,
    enum: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    required: true
  },

  surveyType: {
    type: String,
    enum: ['OFFLINE', 'ONLINE']
  },

  services: {
    packing: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [{ type: mongoose.Schema.Types.ObjectId }]
    },
    assembling: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [{ type: mongoose.Schema.Types.ObjectId }]
    },
    insurance: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [{ type: mongoose.Schema.Types.ObjectId }]
    },
    photography: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [{ type: mongoose.Schema.Types.ObjectId }]
    }
  },

  pricing: {
    priceListId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PriceList'
    },
    estimatedDistance: Number,
    totalWeight: Number,
    totalVolume: Number,

    basePrice: Number,

    servicesFee: {
      packing: Number,
      assembling: Number,
      insurance: Number,
      photography: Number
    },

    staffFee: {
      count: Number,
      pricePerPerson: Number,
      totalStaffFee: Number
    },

    vehicleFee: {
      vehicleType: String,
      pricePerDay: Number,
      pricePerHour: Number,
      totalVehicleFee: Number
    },

    surcharge: Number,

    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Promotion'
    },
    discountCode: String,
    discountAmount: Number,

    subtotal: Number,
    tax: Number,
    totalPrice: Number
  },

  paymentStatus: {
    type: String,
    enum: ['UNPAID', 'PARTIAL', 'PAID'],
    default: 'UNPAID'
  },

  status: {
    type: String,
    enum: [
      'DRAFT',        // Invoice mới tạo từ Ticket
      'CONFIRMED',    // Đã xác nhận (sau khi cọc OK)
      'ASSIGNED',     // Đã điều phối xe & nhân sự
      'PICKUP',       // Đang bốc hàng
      'IN_TRANSIT',   // Đang vận chuyển
      'DELIVERY',     // Đang giao
      'COMPLETED',    // Hoàn tất
      'CANCELLED'
    ],
    default: 'DRAFT'
  }
  ,

  assignment: {
    vehicles: [{
      vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
      driverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      staffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      assignedAt: Date
    }],
    assignmentDate: Date
  },

  timeline: [{
    status: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: Date,
    notes: String
  }],

  notes: String
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
