const mongoose = require('mongoose');

const requestTicketSchema = new mongoose.Schema({
  code: { type: String, unique: true },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  dispatcherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  moveType: {
    type: String,
    enum: ['FULL_HOUSE', 'SPECIFIC_ITEMS', 'TRUCK_RENTAL'],
    required: true
  },

  rentalDetails: {
    truckType: String,
    rentalDurationHours: Number,
    withDriver: { type: Boolean, default: false },
    withHelper: { type: Boolean, default: false }
  },

  pickup: {
    address: String,
    district: String,
    coordinates: { lat: Number, lng: Number }
  },

  delivery: {
    address: String,
    district: String,
    coordinates: { lat: Number, lng: Number }
  },

  items: [{
    name: String,
    quantity:  { type: Number, default: 1 },
    notes: String,
    isSpecialItem:          { type: Boolean, default: false },
    requiresManualHandling: { type: Boolean, default: false },

    // Rich fields (populated by AI analyzer for SPECIFIC_ITEMS / TRUCK_RENTAL)
    actualVolume: Number,
    actualWeight: Number,
    actualDimensions: {
      length: Number,
      width:  Number,
      height: Number
    },
    condition: {
      type: String,
      enum: ['GOOD', 'DAMAGED', 'FRAGILE'],
      default: 'GOOD'
    }
  }],

  /* ===== AI LOGISTICS ESTIMATE (SPECIFIC_ITEMS / TRUCK_RENTAL) ===== */
  // Pre-filled by the AI analyzer at ticket creation; dispatcher reviews / tweaks in WAITING_REVIEW
  aiEstimate: {
    suggestedVehicle: {
      type: String,
      enum: ['500KG', '1TON', '1.5TON', '2TON']
    },
    suggestedStaffCount: Number,
    estimatedHours:      Number,
    distanceKm:          Number,
    floors:              { type: Number, default: 0 },
    hasElevator:         { type: Boolean, default: false },
    needsAssembling:     { type: Boolean, default: false },
    needsPacking:        { type: Boolean, default: false },
    insuranceRequired:   { type: Boolean, default: false },
    declaredValue:       Number,
    carryMeter:          { type: Number, default: 0 },
    totalActualVolume:   Number,
    totalActualWeight:   Number,
  },

  scheduledTime: {
    type: Date,
    required: true
  },

  /* ===== QUOTE SNAPSHOT ===== */
  pricing: {
    pricingDataId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PricingData'
    },

    subtotal: Number,
    tax: Number,
    totalPrice: Number,

    version: Number,
    quotedAt: Date,
    acceptedAt: Date,

    isFinalized: { type: Boolean, default: false }
  },

  status: {
    type: String,
    enum: [
      'CREATED',
      'WAITING_REVIEW',     // SPECIFIC_ITEMS / TRUCK_RENTAL: district dispatcher reviewing AI data + pricing
      'WAITING_SURVEY',     // FULL_HOUSE: survey scheduled, waiting for surveyor
      'ASSIGNMENT_FAILED',  // Auto-assign of review dispatcher failed → Head Dispatcher fallback
      'SURVEYED',
      'QUOTED',
      'ACCEPTED',
      'CONVERTED',
      'CANCELLED'
    ],
    default: 'CREATED'
  },
  paymentOrderCode: {
    type: Number,
    unique: true,
    sparse: true
  },

  // isSurveyPaid: {
  //   type: Boolean,
  //   default: false
  // },

  proposedSurveyTimes: [{
    type: Date
  }],
  rescheduleReason: {
    type: String
  },
  notes: String

}, { timestamps: true });
requestTicketSchema.virtual("invoice", {
  ref: "Invoice",
  localField: "_id",
  foreignField: "requestTicketId",
  justOne: true
});

requestTicketSchema.set("toObject", { virtuals: true });
requestTicketSchema.set("toJSON", { virtuals: true });
module.exports = mongoose.model('RequestTicket', requestTicketSchema);