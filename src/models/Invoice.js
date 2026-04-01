const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  code: { type: String, unique: true, index: true },

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

  surveyDataId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurveyData'
  },

  dispatchAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DispatchAssignment'
  },

  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route'
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
      'ACCEPTED',
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

  notes: String,

  scheduledTime: {
    type: Date,
    required: true
  },

  paidAmount: {
    type: Number,
    default: 0
  },

  remainingAmount: {
    type: Number
  },

  paymentOrderCode: {
    type: Number,
    unique: true,
    sparse: true
  },
  isRated: {
     type: Boolean,
     default: false,
   },

  // Nghiệm thu hoàn thành
  completionEvidence: {
    beforeImages: [String], // Ảnh trước khi chuyển
    afterImages: [String],  // Ảnh sau khi chuyển xong
    customerSignature: String // Chữ ký xác nhận của khách hàng
  }

}, { timestamps: true });
invoiceSchema.virtual("incident", {
  ref: "Incident",
  localField: "_id",
  foreignField: "invoiceId",
  justOne: true
});
invoiceSchema.set("toObject", { virtuals: true });
invoiceSchema.set("toJSON", { virtuals: true });
module.exports = mongoose.model('Invoice', invoiceSchema);