const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  code: { type: String, unique: true },

  // --- CÁC LIÊN KẾT CỐT LÕI ---
  requestTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'RequestTicket', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dispatcherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // --- ĐỊA ĐIỂM ---
  pickup: {
    address: String,
    coordinates: { lat: Number, lng: Number }
  },
  delivery: {
    address: String,
    coordinates: { lat: Number, lng: Number }
  },

  moveType: { type: String, enum: ['FULL_HOUSE', 'SPECIFIC_ITEMS'], required: true },

  // --- MODULE LIÊN KẾT ---
  surveyDataId: { type: mongoose.Schema.Types.ObjectId, ref: 'SurveyData' },
  pricingDataId: { type: mongoose.Schema.Types.ObjectId, ref: 'PricingData' },
  dispatchAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'DispatchAssignment' },
  routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },

  // --- [NEW] HỢP ĐỒNG ĐIỆN TỬ ---
  contract: {
    isSigned: { type: Boolean, default: false },
    signedAt: Date,
    contractUrl: String, // Link file PDF hợp đồng đã ký
    termsVersion: String // Phiên bản điều khoản (v1.0, v1.1)
  },

  // --- [NEW] PROOF OF SERVICE (BẰNG CHỨNG GIAO HÀNG) ---
  proofOfService: {
    pickupImages: [String],    // Ảnh chụp đồ đạc trước khi bốc lên xe
    pickupTime: Date,          // Thời gian bắt đầu bốc

    deliveryImages: [String],  // Ảnh chụp đồ đạc sau khi hạ xuống (nguyên vẹn)
    deliveryTime: Date,        // Thời gian hoàn tất
    
    customerSignature: String, // Chữ ký xác nhận của khách (nếu có)
    driverNote: String
  },

  // --- GIÁ & THANH TOÁN ---
  cachedPrice: {
    totalPrice: Number,
    tax: Number,
    subtotal: Number,
    lastUpdated: Date
  },
  paymentStatus: { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID'], default: 'UNPAID' },

  // --- TRẠNG THÁI ---
  status: {
    type: String,
    enum: [
      'DRAFT', 'CONFIRMED', 'ASSIGNED', 
      'PICKUP', 'IN_TRANSIT', 'DELIVERY', 
      'COMPLETED', 'CANCELLED'
    ],
    default: 'DRAFT'
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