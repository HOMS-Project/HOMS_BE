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
    enum: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    required: true
  },

  pickup: {
    address: String,
    coordinates: { lat: Number, lng: Number }
  },

  delivery: {
    address: String,
    coordinates: { lat: Number, lng: Number }
  },

  items: [{
    name: String,
    quantity: Number,
    notes: String
  }],

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
      'WAITING_SURVEY',
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
isDepositPaid: {
  type: Boolean,
  default: false
},
  proposedSurveyTimes: [{
    type: Date
  }],

  notes: String

}, { timestamps: true });

module.exports = mongoose.model('RequestTicket', requestTicketSchema);