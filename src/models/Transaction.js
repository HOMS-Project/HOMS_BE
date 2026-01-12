const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  paymentMethod: {
    type: String,
    enum: ['COD', 'Card', 'Wallet', 'Bank Transfer', 'Cash', 'VNPay', 'Banking'],
    required: true
  },

  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded', 'Partial Refund'],
    default: 'Pending'
  },

  paymentGateway: String,

  transactionId: String,

  paymentDetails: {
    cardLast4: String,
    cardBrand: String,
    bankName: String,
    walletProvider: String
  },

  receiptUrl: String,

  invoiceUrl: String,

  paidAt: Date,

  refund: {
    amount: Number,
    reason: String,
    refundedAt: Date,
    refundStatus: {
      type: String,
      enum: ['Pending', 'Completed', 'Failed']
    }
  },

  notes: String
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
