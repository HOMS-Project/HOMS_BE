const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  code: { type: String, unique: true },

  requestTicketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RequestTicket',
    required: true
  },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  pricingDataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PricingData',
    required: true
  },

  /* ===== SNAPSHOT GIÁ ===== */
  priceSnapshot: {
    subtotal: Number,
    tax: Number,
    totalPrice: Number,
    breakdown: Object
  },

  paymentStatus: {
    type: String,
    enum: ['UNPAID', 'PARTIAL', 'PAID'],
    default: 'UNPAID'
  },

  status: {
    type: String,
    enum: [
      'DRAFT',
      'CONFIRMED',
      'ASSIGNED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED'
    ],
    default: 'DRAFT'
  },

  timeline: [{
    status: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedAt: Date,
    notes: String
  }],

  notes: String

}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);