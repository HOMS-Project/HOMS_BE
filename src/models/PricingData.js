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

  /* ===== BREAKDOWN (matches calculation formula) =====
   * TOTAL = baseTransportFee + vehicleFee + laborFee + serviceFee
   *       + distanceSurcharge + difficultySurcharge (carryFee + floorFee)
   *       + insuranceFee + managementFee
   *       - discountAmount  ← BEFORE tax
   *       + tax
   */
  breakdown: {
    baseTransportFee: { type: Number, default: 0 },  // Tiered transport base cost
    vehicleFee: { type: Number, default: 0 },  // Vehicle base + distance surcharge
    laborFee: { type: Number, default: 0 },  // staffCount × hourlyRate × estimatedHours
    serviceFee: { type: Number, default: 0 },  // Per-item fees (TV, fridge, etc.) + packing/assembling
    distanceSurcharge: { type: Number, default: 0 },  // Extra distance surcharge (if distanceSurchargePerKm > 0)
    carryFee: { type: Number, default: 0 },  // Carry distance surcharge (beyond freeCarryDistance)
    floorFee: { type: Number, default: 0 },  // Stair / elevator surcharge
    insuranceFee: { type: Number, default: 0 },  // declaredValue × insuranceRate
    managementFee: { type: Number, default: 0 },  // subtotal × managementFeeRate
    estimatedHours: { type: Number, default: 0 }   // Hours used for labor calculation (audit trail)
  },

  subtotal: { type: Number, required: true },     // Sum of all breakdown items + managementFee
  discountAmount: { type: Number, default: 0 },   // Applied BEFORE tax
  tax: { type: Number, required: true },          // (subtotal - discountAmount) × taxRate
  totalPrice: { type: Number, required: true },   // subtotal - discountAmount + tax

  minimumChargeApplied: { type: Boolean, default: false },

  /* Snapshot key rates at the time of calculation (audit / drift protection) */
  priceListSnapshot: {
    taxRate: Number,
    minimumCharge: Number,
    managementFeeRate: Number
  },

  calculatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  isApproved: { type: Boolean, default: false },

  notes: String

}, { timestamps: true });

module.exports = mongoose.model('PricingData', pricingDataSchema);