const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  // [FIX]: Trỏ về Invoice nơi xảy ra sự cố
  invoiceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Invoice', 
    required: true 
  },

  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['Damage', 'Delay', 'Accident', 'Loss', 'Other'] },
  
  description: String,
  images: [String], // Ảnh bằng chứng sự cố

  status: { type: String, enum: ['Open', 'Investigating', 'Resolved', 'Dismissed'], default: 'Open' },
  
  resolution: {
    action: String, // 'Refund', 'Compensation', 'Apology'
    compensationAmount: Number,
    resolvedAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Incident', incidentSchema);