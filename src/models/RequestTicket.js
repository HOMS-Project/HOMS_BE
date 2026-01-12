const mongoose = require('mongoose');

const requestTicketSchema = new mongoose.Schema({
  code: { type: String, unique: true },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Loại yêu cầu: trọn gói (full house - khảo sát offline) hoặc item cụ thể (specific items - khảo sát online)
  type: {
    type: String,
    enum: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    required: true
  },

  // Loại khảo sát
  surveyType: {
    type: String,
    enum: ['OFFLINE', 'ONLINE'],
    required: true
  },

  // Địa chỉ pickup
  pickupAddress: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Địa chỉ delivery
  deliveryAddress: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  // Mô tả căn phòng/nhà
  roomInfo: {
    width: Number, // chiều rộng (m)
    length: Number, // chiều dài (m)
    height: Number, // chiều cao (m)
    totalSquareMeters: Number
  },

  // Items - chỉ dùng khi SPECIFIC_ITEMS
  items: [{
    name: String,
    quantity: Number,
    dimensions: {
      length: Number, // cm
      width: Number,  // cm
      height: Number // cm
    },
    weight: Number, // kg
    material: String,
    images: [String], // ảnh từng item
    note: String,
    createdAt: { type: Date, default: Date.now }
  }],

  // Ảnh tổng thể căn phòng (cho TH chụp tình trạng ban đầu)
  overallPhotos: [String],

  // Khảo sát chi tiết
  survey: {
    dispatcherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    surveyDate: Date,
    notes: String,
    estimatedPrice: Number,
    estimatedWeight: Number,
    estimatedVolume: Number,
    recommendedVehicles: [String],
    staffCount: Number // số người cần thiết
  },

  // Trạng thái
  status: {
    type: String,
    enum: [
      'CREATED',           // Khách tạo ticket
      'WAITING_SURVEY',    // Chờ khảo sát
      'SURVEYED',          // Đã khảo sát, đang chờ duyệt giá
      'PRICE_QUOTED',      // Đã báo giá
      'CUSTOMER_ACCEPTED', // Khách đồng ý
      'CUSTOMER_REJECTED', // Khách từ chối
      'INVOICE_CREATED',   // Tạo Invoice (hợp đồng)
      'CANCELLED'
    ],
    default: 'CREATED'
  },

  // Thông tin hợp đồng
  contract: {
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    createdAt: Date
  },

  timeline: {
    createdAt: { type: Date, default: Date.now },
    surveyStartedAt: Date,
    surveyCompletedAt: Date,
    priceQuotedAt: Date,
    customerAcceptedAt: Date,
    invoiceCreatedAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('RequestTicket', requestTicketSchema);
