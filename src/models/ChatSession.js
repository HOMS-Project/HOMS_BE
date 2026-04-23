const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
  facebookId: { type: String, required: true, unique: true },
  history: { type: Array, default: [] }, 
  visionItems: { type: Array, default: [] },
  visionWeight: { type: Number, default: 0 },
  visionVolume: { type: Number, default: 0 },
  surveyDataCache: { type: mongoose.Schema.Types.Mixed, default: {} },  
  calculatedPriceResult: { type: Object, default: null },
  processedMids: { type: [String], default: [] },
  lastActive: { type: Date, default: Date.now, expires: 86400 } 
});

module.exports = mongoose.model('ChatSession', chatSessionSchema);