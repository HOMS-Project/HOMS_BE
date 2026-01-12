/**
 * Seed data cho Transaction
 * Ghi nhận giao dịch thanh toán
 */

const mongoose = require('mongoose');

const mockOrderId1 = new mongoose.Types.ObjectId();
const mockOrderId2 = new mongoose.Types.ObjectId();
const mockOrderId3 = new mongoose.Types.ObjectId();

const transactionData = [
  {
    orderId: mockOrderId1,
    amount: 4235000,
    paymentMethod: 'Card',
    status: 'Completed',
    paymentGateway: 'Stripe',
    transactionId: 'txn_2026_001_stripe',
    paymentDetails: {
      cardLast4: '4242',
      cardBrand: 'Visa',
      bankName: null,
      walletProvider: null
    },
    receiptUrl: 'https://example.com/receipt_001.pdf',
    invoiceUrl: 'https://example.com/invoice_001.pdf',
    paidAt: new Date('2026-01-07T15:00:00'),
    refund: null,
    notes: 'Thanh toán thẻ tín dụng thành công'
  },
  {
    orderId: mockOrderId1,
    amount: 4235000,
    paymentMethod: 'COD',
    status: 'Pending',
    paymentGateway: null,
    transactionId: 'txn_2026_001_cod',
    paymentDetails: {},
    receiptUrl: null,
    invoiceUrl: 'https://example.com/invoice_001.pdf',
    paidAt: null,
    refund: null,
    notes: 'Thu tiền tại chỗ giao hàng'
  },
  {
    orderId: mockOrderId2,
    amount: 1911000,
    paymentMethod: 'VNPay',
    status: 'Completed',
    paymentGateway: 'VNPay',
    transactionId: 'txn_2026_002_vnpay',
    paymentDetails: {
      cardLast4: '5678',
      cardBrand: 'MasterCard',
      bankName: 'Vietcombank',
      walletProvider: null
    },
    receiptUrl: 'https://example.com/receipt_002.pdf',
    invoiceUrl: 'https://example.com/invoice_002.pdf',
    paidAt: new Date('2026-01-08T16:00:00'),
    refund: null,
    notes: 'Thanh toán qua VNPay thành công'
  },
  {
    orderId: mockOrderId3,
    amount: 2500000,
    paymentMethod: 'Wallet',
    status: 'Completed',
    paymentGateway: 'Internal Wallet',
    transactionId: 'txn_2026_003_wallet',
    paymentDetails: {
      walletProvider: 'HOMS Wallet'
    },
    receiptUrl: 'https://example.com/receipt_003.pdf',
    invoiceUrl: 'https://example.com/invoice_003.pdf',
    paidAt: new Date('2026-01-09T08:00:00'),
    refund: null,
    notes: 'Thanh toán từ ví HOMS'
  },
  {
    orderId: mockOrderId2,
    amount: 500000,
    paymentMethod: 'Card',
    status: 'Completed',
    paymentGateway: 'Stripe',
    transactionId: 'txn_2026_002_refund',
    paymentDetails: {
      cardLast4: '5678',
      cardBrand: 'MasterCard'
    },
    receiptUrl: 'https://example.com/receipt_refund.pdf',
    invoiceUrl: null,
    paidAt: null,
    refund: {
      amount: 500000,
      reason: 'Khách yêu cầu hoàn tiền khuyến mãi do không sử dụng đầy đủ',
      refundedAt: new Date('2026-01-10T10:00:00'),
      refundStatus: 'Completed'
    },
    notes: 'Hoàn tiền một phần 500K'
  },
  {
    orderId: new mongoose.Types.ObjectId(),
    amount: 3000000,
    paymentMethod: 'Banking',
    status: 'Failed',
    paymentGateway: 'Banking',
    transactionId: 'txn_2026_004_banking',
    paymentDetails: {
      bankName: 'Agribank'
    },
    receiptUrl: null,
    invoiceUrl: null,
    paidAt: null,
    refund: null,
    notes: 'Chuyển khoản thất bại - Tài khoản không đủ tiền'
  }
];

module.exports = transactionData;
