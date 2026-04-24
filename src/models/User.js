const mongoose = require('mongoose');
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
      return this.provider === 'local';
    }
  },

  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },

  phone: { type: String, unique: true, sparse: true, trim: true },

  // Optional contact address for the user
  address: { type: String },

  password: {
    type: String,
    required: function () {
      return this.provider === 'local';
    }
  },

  provider: {
    type: String,
    enum: ['local', 'google','facebook','local_and_facebook'],
    default: 'local'
  },
 facebookId: { type: String, unique: true, sparse: true },
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
