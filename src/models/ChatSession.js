const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
  facebookId: { type: String, required: true, unique: true },
  history: { type: Array, default: [] }, // Lưu mảng lịch sử chat của Gemini
  visionItems: { type: Array, default: [] },
  visionWeight: { type: Number, default: 0 },
  visionVolume: { type: Number, default: 0 },
  surveyDataCache: { type: Object, default: null },
  calculatedPriceResult: { type: Object, default: null },
  processedMids: { type: [String], default: [] }, // Danh sách các message ID đã xử lý
  lastActive: { type: Date, default: Date.now, expires: 86400 } 
});

module.exports = mongoose.model('ChatSession', chatSessionSchema);