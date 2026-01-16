const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },

  email: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },

  password: { type: String, required: true },

  role: {
    type: String,
    enum: ['customer', 'dispatcher', 'driver', 'admin'],
    default: 'customer'
  },

  avatar: String,

  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Blocked'],
    default: 'Active'
  },

  // Chỉ áp dụng cho Driver
  driverProfile: {
    licenseNumber: String,
    skills: [String], // bốc xếp, lái xe tải lớn, tháo lắp
    isAvailable: { type: Boolean, default: true }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
