const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: function () {
      return this.provider === 'local';
    }
  },

  email: { type: String, unique: true, sparse: true },

  password: {
    type: String,
    required: function () {
      return this.provider === 'local';
    }
  },

  provider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },

  googleId: String,

  avatar: String,

  role: {
    type: String,
    enum: ['customer', 'dispatcher', 'driver', 'admin'],
    default: 'customer'
  },

  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Blocked'],
    default: 'Active'
  },

  driverProfile: {
    licenseNumber: String,
    skills: [String],
    isAvailable: { type: Boolean, default: true }
  },
  otpResetPassword: String,
otpResetExpires: Date,
}, { timestamps: true });



module.exports = mongoose.model('User', userSchema);
