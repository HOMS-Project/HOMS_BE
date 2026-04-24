/**
 * Seed data cho RequestTicket
 * 2 ví dụ: 1 FULL_HOUSE (offline), 1 SPECIFIC_ITEMS (online)
 */

const mongoose = require('mongoose');

const mockUserId = new mongoose.Types.ObjectId();
const mockDispatcherId = new mongoose.Types.ObjectId();

const requestTicketData = [
  // TH1: Chuyển nhà trọn gói - Khảo sát offline
  {
    code: 'TICKET_2026_001',
    customerId: mockUserId,
    dispatcherId: mockDispatcherId,
    moveType: 'FULL_HOUSE',
    status: 'QUOTED',
    distanceKm: 5,

    pickup: {
      address: '123 Nguyễn Huệ, Q1, TP.HCM',
      district: 'HAI_CHAU',
      coordinates: { lat: 10.7725, lng: 106.6992 }
    },

    delivery: {
      address: '456 Tân Định, Q3, TP.HCM',
      district: 'THANH_KHE',
      coordinates: { lat: 10.7869, lng: 106.6780 }
    },

    scheduledTime: new Date('2026-01-06T10:00:00'),

    pricing: {
      subtotal: 3500000,
      tax: 350000,
      totalPrice: 3850000,
      quotedAt: new Date('2026-01-06T12:00:00')
    },
    
    notes: 'Nhà 2 phòng, nội thất cũ, cần tháo lắp tủ quần áo'
  },

  // TH2: Chuyển items cụ thể - Khảo sát online
  {
    code: 'TICKET_2026_002',
    customerId: new mongoose.Types.ObjectId(),
    dispatcherId: new mongoose.Types.ObjectId(),
    moveType: 'SPECIFIC_ITEMS',
    status: 'ACCEPTED',
    distanceKm: 12,

    pickup: {
      address: '789 Võ Văn Ngân, Thủ Đức, TP.HCM',
      district: 'SON_TRA',
      coordinates: { lat: 10.8013, lng: 106.7629 }
    },

    delivery: {
      address: '321 Lê Lợi, Q1, TP.HCM',
      district: 'HAI_CHAU',
      coordinates: { lat: 10.7725, lng: 106.6992 }
    },

    scheduledTime: new Date('2026-01-05T16:00:00'),

    pricing: {
      subtotal: 1200000,
      tax: 120000,
      totalPrice: 1320000,
      quotedAt: new Date('2026-01-05T17:00:00'),
      acceptedAt: new Date('2026-01-05T20:00:00')
    },

    isHighValue: true,
    highValueDetails: {
      declaredValue: 50000000,
      description: 'Đồ điện tử',
      category: 'ELECTRONICS'
    },

    notes: 'Khách call video để thảo luận, items không quá nặng'
  }
];

module.exports = requestTicketData;
