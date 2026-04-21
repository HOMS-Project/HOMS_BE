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
    extraStaffCount: { type: Number, default: 0 },
    needsPacking: { type: Boolean, default: false },
    needsAssembling: { type: Boolean, default: false },
    withDriver: { type: Boolean, default: false },
    withHelper: { type: Boolean, default: false }
  },

  // distance in kilometers for pricing (optional)
  distanceKm: Number,

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

  scheduledTime: {
    type: Date
  },
  endTime: {
    type: Date
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
      promotion: {
        promotionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion' },
        code: String,
        discountAmount: Number,
        discountType: String,
        discountValue: Number,
        appliedAt: Date
      },
      totalAfterPromotion: Number,
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

requestTicketSchema.virtual("surveyDataId", {
  ref: "SurveyData",
  localField: "_id",
  foreignField: "requestTicketId",
  justOne: true
});

requestTicketSchema.set("toObject", { virtuals: true });
requestTicketSchema.set("toJSON", { virtuals: true });
module.exports = mongoose.model('RequestTicket', requestTicketSchema);