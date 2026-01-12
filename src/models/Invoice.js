const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  code: { type: String, unique: true },

  // Liên kết với RequestTicket (hợp đồng được tạo từ ticket đã được duyệt)
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

  // Địa chỉ lấy hàng
  pickup: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Địa chỉ giao hàng
  delivery: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Tuyến đường được chọn
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
  },

  // Thời gian theo khung giờ phù hợp
  scheduledTime: Date,
  scheduledTimeWindow: {
    startTime: String, // HH:mm
    endTime: String    // HH:mm
  },

  // Deadline giao hàng (yêu cầu từ khách)
  deliveryDeadline: Date,

  // Tính toán tài nguyên & thời gian
  resourcePlanning: {
    // Thời gian ước tính (phút)
    estimatedPickupTime: { type: Number, default: 30 }, // Thời gian lấy hàng
    estimatedDeliveryTime: { type: Number, default: 30 }, // Thời gian giao hàng
    travelTime: Number, // Thời gian vận chuyển (tính từ Route)
    totalTimeRequired: Number, // Tổng thời gian cần thiết (pickup + travel + delivery)

    // Thời gian khả dụng
    timeAvailable: Number, // Phút từ hiện tại đến deadline
    currentTime: Date, // Thời điểm tính toán

    // Phân bổ tài nguyên
    vehiclesNeeded: { type: Number, default: 1 }, // Số xe cần thiết
    strategyUsed: {
      type: String,
      enum: ['SINGLE_VEHICLE', 'PARALLEL_PICKUP_DELIVERY', 'STAGGERED'],
      default: 'SINGLE_VEHICLE'
    },
    notes: String // Ghi chú lý do phân bổ (vd: "Thời gian hạn chế, cần 2 xe để pickup+delivery song song")
  },

  // Loại chuyển nhà
  moveType: {
    type: String,
    enum: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    required: true
  },

  // Loại khảo sát
  surveyType: {
    type: String,
    enum: ['OFFLINE', 'ONLINE']
  },

  // Dịch vụ được chọn
  // Có thể là dạng boolean (áp dụng cho toàn bộ) hoặc list items cụ thể
  services: {
    packing: {
      isAppliedAll: { type: Boolean, default: false }, // Áp dụng cho toàn bộ
      itemIds: [mongoose.Schema.Types.ObjectId] // Hoặc chỉ những item cụ thể
    },
    assembling: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [mongoose.Schema.Types.ObjectId]
    },
    insurance: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [mongoose.Schema.Types.ObjectId]
    },
    photography: {
      isAppliedAll: { type: Boolean, default: false },
      itemIds: [mongoose.Schema.Types.ObjectId] // Item cần kiểm tra kĩ
    }
  },

  // Items từ RequestTicket
  items: [{
    _id: mongoose.Schema.Types.ObjectId,
    name: String,
    quantity: Number,
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    weight: Number,
    material: String,
    
    // Ảnh của item này (nếu cần kiểm tra kĩ)
    photos: {
      before: [String], // Ảnh trước
      after: [String]   // Ảnh sau
    },
    
    note: String
  }],

  // Định giá chi tiết
  pricing: {
    priceListId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PriceList'
    },
    estimatedDistance: Number,
    totalWeight: Number,
    totalVolume: Number,

    // Chi phí cơ bản
    basePrice: Number,
    
    // Chi phí dịch vụ
    servicesFee: {
      packing: Number,
      assembling: Number,
      insurance: Number,
      photography: Number
    },

    // Chi phí nhân công
    staffFee: {
      count: Number,
      pricePerPerson: Number,
      totalStaffFee: Number
    },

    // Chi phí xe
    vehicleFee: {
      vehicleType: String,
      pricePerDay: Number,
      pricePerHour: Number,
      totalVehicleFee: Number
    },

    // Phụ phí (tuyến đường đặc biệt, etc.)
    surcharge: Number,

    // Khuyến mãi
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Promotion'
    },
    discountCode: String,
    discountAmount: Number,

    // Tổng cộng
    subtotal: Number,
    tax: Number,
    totalPrice: Number
  },

  // Trạng thái hợp đồng
  status: {
    type: String,
    enum: [
      'DRAFT',           // Nháp
      'PENDING',         // Chờ xác nhận
      'CONFIRMED',       // Đã xác nhận
      'ASSIGNED',        // Đã phân công
      'IN_PROGRESS',     // Đang thực hiện
      'PICKUP',          // Đã lấy hàng
      'IN_TRANSIT',      // Đang vận chuyển
      'DELIVERY',        // Đang giao hàng
      'COMPLETED',       // Hoàn thành
      'CANCELLED'        // Hủy
    ],
    default: 'PENDING'
  },

  // Phân công - hỗ trợ nhiều xe
  assignment: {
    vehicles: [{
      vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
      driverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      staffIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      assignedAt: Date
    }],
    assignmentDate: Date
  },

  // Hình ảnh - chỉ cho các item cần kiểm tra kĩ (đã chuyển vào items[].photos)
  // Giữ lại cho backup hoặc ảnh tổng thể
  overallPhotos: {
    pickupBefore: [String],
    deliveryAfter: [String]
  },

  // Thanh toán
  payment: {
    method: {
      type: String,
      enum: ['COD', 'Card', 'Wallet', 'Bank Transfer'],
      default: 'COD'
    },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
      default: 'Pending'
    },
    paidAt: Date,
    transactionId: String
  },

  // Timeline theo dõi
  timeline: [{
    status: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: Date,
    notes: String
  }],

  // Đánh giá
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    driverRating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    ratedAt: Date
  },

  // Ghi chú
  notes: String,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
