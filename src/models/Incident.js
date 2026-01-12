const mongoose = require('mongoose');

const incidentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },

  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  type: {
    type: String,
    enum: ['Damage', 'Delay', 'Accident']
  },

  description: String,
  images: [String],

  status: {
    type: String,
    enum: ['Open', 'Resolved'],
    default: 'Open'
  }
}, { timestamps: true });

module.exports = mongoose.model('Incident', incidentSchema);
