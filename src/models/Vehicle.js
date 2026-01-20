const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  plateNumber: { type: String, required: true, unique: true },

  vehicleType: {
    type: String,
    enum: ['Truck', 'Van', 'Pickup'],
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
