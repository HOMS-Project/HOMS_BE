const mongoose = require('mongoose');

const surveyDataSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },

  surveyType: {
    type: String,
    enum: ['OFFLINE', 'ONLINE'],
    required: true
  },

  status: {
    type: String,
    enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
    default: 'SCHEDULED'
  },

  // Lịch khảo sát
  scheduledDate: Date,
  completedDate: Date,

  // Chi tiết khảo sát
  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId }, // từ RequestTicket
    actualWeight: Number,   // kg (thực tế sau khảo sát)
    actualDimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    actualVolume: Number,   // m3 (tính từ dimensions)
    condition: String,      // 'GOOD', 'DAMAGED', 'FRAGILE'
    notes: String
  }],

  // Kết quả khảo sát tổng hợp
  totalActualWeight: Number,   // kg
  totalActualVolume: Number,   // m3
  totalActualItems: Number,

  // Quang cảnh & môi trường
  accessibility: {
    floorLevel: Number,        // tầng
    elevatorAvailable: Boolean,
    stairsNarrow: Boolean,     // cần xem xét số nhân sự
    narrow: Boolean,           // hẻm hẹp
    notes: String
  },

  // Người khảo sát
  surveyorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  notes: String,
  images: [String],

  // Dùng để cập nhật giá sau khảo sát
  needsRepricing: { type: Boolean, default: false },

}, { timestamps: true });

module.exports = mongoose.model('SurveyData', surveyDataSchema);
