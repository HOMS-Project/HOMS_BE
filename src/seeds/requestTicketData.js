/**
 * Seed data cho RequestTicket
 * 2 ví dụ: 1 FULL_HOUSE (offline), 1 SPECIFIC_ITEMS (online)
 */

const mongoose = require('mongoose');

// Mock ObjectId cho demo
const mockUserId = new mongoose.Types.ObjectId();
const mockDispatcherId = new mongoose.Types.ObjectId();

const requestTicketData = [
  // TH1: Chuyển nhà trọn gói - Khảo sát offline
  {
    code: 'TICKET_2026_001',
    customerId: mockUserId,

    type: 'FULL_HOUSE',
    surveyType: 'OFFLINE',

    pickupAddress: {
      address: '123 Nguyễn Huệ, Q1, TP.HCM',
      coordinates: { lat: 10.7725, lng: 106.6992 }
    },

    deliveryAddress: {
      address: '456 Tân Định, Q3, TP.HCM',
      coordinates: { lat: 10.7869, lng: 106.6780 }
    },

    roomInfo: {
      width: 5, // 5m
      length: 6, // 6m
      height: 3, // 3m
      totalSquareMeters: 30
    },

    items: [], // Không có items chi tiết vì là FULL_HOUSE

    overallPhotos: [
      'https://example.com/room1_before.jpg',
      'https://example.com/room2_before.jpg'
    ],

    survey: {
      dispatcherId: mockDispatcherId,
      surveyDate: new Date('2026-01-06T10:00:00'),
      notes: 'Nhà 2 phòng, nội thất cũ, cần tháo lắp tủ quần áo',
      estimatedPrice: 3500000,
      estimatedWeight: 800,
      estimatedVolume: 8,
      recommendedVehicles: ['2T'],
      staffCount: 3
    },

    status: 'PRICE_QUOTED',

    contract: null,

    timeline: {
      createdAt: new Date('2026-01-05T14:00:00'),
      surveyStartedAt: new Date('2026-01-06T10:00:00'),
      surveyCompletedAt: new Date('2026-01-06T11:30:00'),
      priceQuotedAt: new Date('2026-01-06T12:00:00'),
      customerAcceptedAt: null,
      invoiceCreatedAt: null
    }
  },

  // TH2: Chuyển items cụ thể - Khảo sát online
  {
    code: 'TICKET_2026_002',
    customerId: new mongoose.Types.ObjectId(),

    type: 'SPECIFIC_ITEMS',
    surveyType: 'ONLINE',

    pickupAddress: {
      address: '789 Võ Văn Ngân, Thủ Đức, TP.HCM',
      coordinates: { lat: 10.8013, lng: 106.7629 }
    },

    deliveryAddress: {
      address: '321 Lê Lợi, Q1, TP.HCM',
      coordinates: { lat: 10.7725, lng: 106.6992 }
    },

    roomInfo: {
      width: 4,
      length: 5,
      height: 3,
      totalSquareMeters: 20
    },

    items: [
      {
        name: 'Sofa 3 chỗ',
        quantity: 1,
        dimensions: { length: 200, width: 90, height: 80 },
        weight: 80,
        material: 'Vải',
        images: ['https://example.com/sofa_item.jpg'],
        note: 'Màu xám, hơi cũ'
      },
      {
        name: 'Tủ lạnh 2 cánh',
        quantity: 1,
        dimensions: { length: 70, width: 65, height: 170 },
        weight: 100,
        material: 'Kim loại',
        images: ['https://example.com/fridge_item.jpg'],
        note: 'Hàng LG, còn mới'
      },
      {
        name: 'Bàn ăn gỗ',
        quantity: 1,
        dimensions: { length: 150, width: 80, height: 75 },
        weight: 60,
        material: 'Gỗ',
        images: ['https://example.com/dining_table_item.jpg'],
        note: 'Có 4 ghế'
      }
    ],

    overallPhotos: [
      'https://example.com/livingroom_overview.jpg'
    ],

    survey: {
      dispatcherId: new mongoose.Types.ObjectId(),
      surveyDate: new Date('2026-01-05T16:00:00'), // Video call
      notes: 'Khách call video để thảo luận, items không quá nặng',
      estimatedPrice: 1200000,
      estimatedWeight: 240,
      estimatedVolume: 3,
      recommendedVehicles: ['500kg', '1T'],
      staffCount: 2
    },

    status: 'CUSTOMER_ACCEPTED',

    contract: {
      invoiceId: null, // Sẽ được tạo khi tạo Invoice
      createdAt: null
    },

    timeline: {
      createdAt: new Date('2026-01-04T10:00:00'),
      surveyStartedAt: new Date('2026-01-05T16:00:00'),
      surveyCompletedAt: new Date('2026-01-05T16:30:00'),
      priceQuotedAt: new Date('2026-01-05T17:00:00'),
      customerAcceptedAt: new Date('2026-01-05T20:00:00'),
      invoiceCreatedAt: null
    }
  }
];

module.exports = requestTicketData;
