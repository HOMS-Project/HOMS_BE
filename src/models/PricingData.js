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
    managementFee: { type: Number, default: 0 }
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

  notes: String

}, { timestamps: true });

module.exports = mongoose.model('PricingData', pricingDataSchema);