const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  vehicleId: { type: String, required: true, unique: true },
  plateNumber: { type: String, required: true, unique: true },

  vehicleType: {
    type: String,
    enum: ['500KG', '1TON', '1.5TON', '2TON'],
    required: true
  },

  loadCapacity: Number, // kg

  status: {
    type: String,
    enum: ['Available', 'InTransit', 'Maintenance'],
    default: 'Available'
  },

  isActive: { type: Boolean, default: true }

}, { timestamps: true });


module.exports = mongoose.model('Vehicle', vehicleSchema);
