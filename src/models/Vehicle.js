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

  maxStaff: {
    type: Number,
    default: function() {
      if(this.vehicleType === '500KG') return 2;
      if(this.vehicleType === '1TON') return 3;
      if(this.vehicleType === '1.5TON') return 3;
      if(this.vehicleType === '2TON') return 4;
      return 2;
    }
  },

  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [longitude, latitude]
  },

  status: {
    type: String,
    enum: ['Available', 'InTransit', 'Maintenance'],
    default: 'Available'
  },

  isActive: { type: Boolean, default: true }

}, { timestamps: true });


module.exports = mongoose.model('Vehicle', vehicleSchema);
