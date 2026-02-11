const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // [FIX]: Đổi từ orderId sang invoiceId
  invoiceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Invoice', // Trỏ đúng về Invoice
    required: true 
  },

  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['COD', 'Card', 'Wallet', 'Bank Transfer', 'Cash', 'VNPay'], required: true },
  status: { type: String, enum: ['Pending', 'Completed', 'Failed', 'Refunded'], default: 'Pending' },
  
  transactionId: String, // Mã giao dịch từ cổng thanh toán (VNPAY, Stripe)
  paymentGateway: String,
  
  // Chi tiết hoàn tiền (nếu có sự cố)
  refund: {
    isRefunded: { type: Boolean, default: false },
    amount: Number,
    reason: String,
    refundedAt: Date
  },

  paidAt: Date,
  invoiceUrl: String
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);