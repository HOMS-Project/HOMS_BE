const mongoose = require('mongoose');
const crypto = require('crypto');
const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: function () {
      // provider can be an array (default) or a string, and may be undefined during
      // partial updates. Guard against calling includes on undefined.
      const p = this.provider;
      if (!p) return false;
      if (Array.isArray(p)) return p.includes('local');
      if (typeof p === 'string') return p === 'local';
      return false;
}
  },

  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },

  phone: { type: String, unique: true, sparse: true, trim: true },

  // Optional contact address for the user
  address: { type: String },

  password: {
    type: String,
    required: function () {
      const p = this.provider;
      if (!p) return false;
      if (Array.isArray(p)) return p.includes('local');
      if (typeof p === 'string') return p === 'local';
      return false;
}
  },

  provider: {
    type: [String],
    enum: ['local', 'google','facebook','pending'],
    default:  ['local']
  },
 facebookId: { type: String, unique: true, sparse: true },
  messengerId: { type: String, unique: true, sparse: true },
  googleId: String,

  avatar: String,

  role: {
    type: String,
    enum: ['customer', 'dispatcher', 'driver', 'staff', 'admin'],
    default: 'customer'
  },

  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [108.2022, 16.0544] }, // Default is Da Nang
    updatedAt: { type: Date }
  },

  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Blocked', 'Banned','Pending_Password'],
    default: 'Active'
  },

  driverProfile: {
    licenseNumber: String,
    skills: [String],
    isAvailable: { type: Boolean, default: true }
  },
  dispatcherProfile: {
    workingAreas: [String], // Ví dụ: ['Hải Châu', 'Sơn Trà'] để phân công tự động
    isGeneral: { type: Boolean, default: false }, // Dispatcher tổng có quyền điều phối toàn bộ
    isAvailable: { type: Boolean, default: true }
  },
  otpResetPassword: String,
  otpResetExpires: Date,
  otpVerified: Boolean,
  
  refreshTokens: [refreshTokenSchema],
  securityToken: { type: String, default: () => crypto.randomBytes(16).toString('hex') }
}, { timestamps: true });

userSchema.index({ currentLocation: '2dsphere' });

module.exports = mongoose.model('User', userSchema);
