const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true,
    uppercase: true
  },

  description: String,

  discountType: {
    type: String,
    enum: ['Percentage', 'FixedAmount'],
    required: true
  },

  discountValue: {
    type: Number,
    required: true
  },

  maxDiscount: Number,

  minOrderAmount: Number,

  usageLimit: Number,

  usageCount: {
    type: Number,
    default: 0
  },

  validFrom: {
    type: Date,
    required: true
  },

  validUntil: {
    type: Date,
    required: true
  },

  applicableServices: [String],

  applicableAreas: [String],

  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Expired'],
    default: 'Active'
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('Promotion', promotionSchema);
