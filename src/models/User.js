const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: function () {
        return this.provider === 'local';
      }
    },

    email: { type: String, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },

    password: {
      type: String,
      required: function () {
        return this.provider === 'local';
      },
      select: false
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

    otpResetPassword: {
      type: String,
      select: false
    },
    otpResetExpires: Date,
    refreshTokens: [refreshTokenSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
