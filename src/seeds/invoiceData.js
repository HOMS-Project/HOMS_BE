/**
 * Seed data cho Invoice
 * Tạo từ RequestTicket đã accepted
 */

const mongoose = require('mongoose');

const invoiceData = [
  {
    code: 'INV_2026_001',
    priceSnapshot: {
      subtotal: 3850000,
      tax: 385000,
      totalPrice: 4235000,
      totalAfterPromotion: 4235000,
      breakdown: {}
    },
    paymentStatus: 'UNPAID',
    status: 'CONFIRMED',
    scheduledTime: new Date('2026-01-08T08:00:00'),
    paidAmount: 0,
    remainingAmount: 4235000,
    notes: 'Chuyển nhà trọn gói tại Q1',
    timeline: []
  },
  {
    code: 'INV_2026_002',
    priceSnapshot: {
      subtotal: 2010000,
      tax: 201000,
      totalPrice: 2211000,
      totalAfterPromotion: 1911000,
      breakdown: {}
    },
    paymentStatus: 'PAID',
    status: 'COMPLETED',
    scheduledTime: new Date('2026-01-09T07:00:00'),
    paidAmount: 1911000,
    remainingAmount: 0,
    notes: 'Chuyển nhà items cụ thể Q7→Q1, có khuyến mãi',
    timeline: []
  }
];

module.exports = invoiceData;
