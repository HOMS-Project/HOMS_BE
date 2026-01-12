const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  plateNumber: { type: String, required: true, unique: true },

  vehicleType: {
    type: String,
    enum: ['Truck', 'Van', 'Pickup'],
    required: true
  },

  loadCapacity: Number, // kg

  cargoSpace: {
    length: Number,
    width: Number,
    height: Number
  },

  status: {
    type: String,
    enum: ['Available', 'InTransit', 'Maintenance'],
    default: 'Available'
  },

  currentLocation: {
    lat: Number,
    lng: Number
  }
}, { timestamps: true });

module.exports = mongoose.model('Vehicle', vehicleSchema);
