const mongoose = require('mongoose');

const pricingDataSchema = new mongoose.Schema({
  requestTicketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RequestTicket',
    required: true,
    index: true
  },

  surveyDataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurveyData',
    required: true
  },

  priceListId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PriceList',
    required: true
  },

  version: { type: Number, default: 1 },

  breakdown: {
    baseTransportFee: { type: Number, default: 0 },
    vehicleFee: { type: Number, default: 0 },
    laborFee: { type: Number, default: 0 },
    distanceFee: { type: Number, default: 0 },
    floorFee: { type: Number, default: 0 },
    carryFee: { type: Number, default: 0 },
    assemblingFee: { type: Number, default: 0 },
    packingFee: { type: Number, default: 0 },
    insuranceFee: { type: Number, default: 0 },
    managementFee: { type: Number, default: 0 },
    itemServiceFee: { type: Number, default: 0 },
    estimatedHours: { type: Number, default: 0 },
    suggestedVehicle: { type: String },
    suggestedStaffCount: { type: Number }
  },

  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  totalPrice: { type: Number, required: true },

  minimumChargeApplied: {
    type: Boolean,
    default: false
  },

  discountAmount: { type: Number, default: 0 },

  calculatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  isApproved: { type: Boolean, default: false },

  dynamicAdjustment: {
    label: String,
    score: Number,
    adjustmentPercent: Number,
    appliedAmount: Number,
    reason: String,
    isBlocked: { type: Boolean, default: false },
    blockReason: String,
    suggestAlternatives: { type: Boolean, default: false },
    
    // Snapshot for auditing & ML
    recommendationSnapshot: {
      factors: {
        weather: Number,
        traffic: Number,
        demand: Number,
        businessBoost: Number
      },
      alternatives: [{
        date: String,
        time: String,
        score: Number,
        label: String
      }],
      timestamp: { type: Date, default: Date.now }
    },

    experimentGroup: { type: String, default: 'CONTROL' },
    
    actualOutcome: {
      delayMinutes: Number,
      completionTime: Number,
      customerRating: Number,
      actualWeather: String,
      actualTraffic: String,
      notes: String
    }
  },

  notes: String

}, { timestamps: true });

module.exports = mongoose.model('PricingData', pricingDataSchema);