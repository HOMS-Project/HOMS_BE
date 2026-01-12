/**
 * Seed data cho Invoice
 * Tạo từ RequestTicket đã accepted
 */

const mongoose = require('mongoose');

// Mock ObjectIds (dùng ObjectId.createFromHexString hoặc new ObjectId())
const mockCustomerId = new mongoose.Types.ObjectId();
const mockDispatcherId = new mongoose.Types.ObjectId();
const mockVehicleId1 = new mongoose.Types.ObjectId();
const mockVehicleId2 = new mongoose.Types.ObjectId();
const mockDriverId = new mongoose.Types.ObjectId();
const mockStaffId1 = new mongoose.Types.ObjectId();
const mockStaffId2 = new mongoose.Types.ObjectId();
const mockStaffId3 = new mongoose.Types.ObjectId();
const mockRequestTicketId = new mongoose.Types.ObjectId();
const mockRouteId = new mongoose.Types.ObjectId();
const mockPriceListId = new mongoose.Types.ObjectId();
const mockPromotionId = new mongoose.Types.ObjectId();

const invoiceData = [
  // TH1: Chuyển nhà trọn gói (FULL_HOUSE) - 1 xe
  {
    code: 'INV_2026_001',

    requestTicketId: mockRequestTicketId,
    customerId: mockCustomerId,
    dispatcherId: mockDispatcherId,

    pickup: {
      address: '123 Nguyễn Huệ, Q1, TP.HCM',
      coordinates: { lat: 10.7725, lng: 106.6992 }
    },

    delivery: {
      address: '456 Tân Định, Q3, TP.HCM',
      coordinates: { lat: 10.7869, lng: 106.6780 }
    },

    routeId: mockRouteId,

    scheduledTime: new Date('2026-01-08T08:00:00'),
    scheduledTimeWindow: {
      startTime: '08:00',
      endTime: '12:00'
    },

    deliveryDeadline: new Date('2026-01-08T12:00:00'),

    moveType: 'FULL_HOUSE',
    surveyType: 'OFFLINE',

    services: {
      packing: {
        isAppliedAll: true,
        itemIds: []
      },
      assembling: {
        isAppliedAll: true,
        itemIds: []
      },
      insurance: {
        isAppliedAll: false,
        itemIds: []
      },
      photography: {
        isAppliedAll: false,
        itemIds: []
      }
    },

    items: [
      {
        name: 'Sofa 3 chỗ',
        quantity: 1,
        dimensions: { length: 200, width: 90, height: 80 },
        weight: 80,
        material: 'Vải',
        photos: { before: [], after: [] },
        note: 'Đóng gói toàn bộ'
      },
      {
        name: 'Tủ quần áo 4 cánh',
        quantity: 1,
        dimensions: { length: 200, width: 50, height: 220 },
        weight: 120,
        material: 'Gỗ',
        photos: { before: [], after: [] },
        note: 'Cần tháo lắp'
      },
      {
        name: 'Giường đôi',
        quantity: 1,
        dimensions: { length: 200, width: 160, height: 50 },
        weight: 100,
        material: 'Gỗ',
        photos: { before: [], after: [] },
        note: 'Cần tháo lắp'
      },
      {
        name: 'Bàn làm việc',
        quantity: 1,
        dimensions: { length: 120, width: 60, height: 75 },
        weight: 40,
        material: 'Gỗ',
        photos: { before: [], after: [] },
        note: 'Đơn giản'
      }
    ],

    resourcePlanning: {
      estimatedPickupTime: 60,
      estimatedDeliveryTime: 30,
      travelTime: 15,
      totalTimeRequired: 105,
      timeAvailable: 240,
      currentTime: new Date('2026-01-08T08:00:00'),
      vehiclesNeeded: 1,
      strategyUsed: 'SINGLE_VEHICLE',
      notes: 'Thời gian thoáng, 1 xe đủ'
    },

    pricing: {
      priceListId: mockPriceListId,
      estimatedDistance: 3,
      totalWeight: 340,
      totalVolume: 8,

      basePrice: 2000000, // FULL_HOUSE base

      servicesFee: {
        packing: 300000,
        assembling: 500000,
        insurance: 0,
        photography: 0
      },

      staffFee: {
        count: 3,
        pricePerPerson: 150000,
        totalStaffFee: 450000
      },

      vehicleFee: {
        vehicleType: '2T',
        pricePerDay: 1200000,
        pricePerHour: 300000,
        totalVehicleFee: 600000
      },

      surcharge: 0,

      promotionId: null,
      discountCode: null,
      discountAmount: 0,

      subtotal: 3850000,
      tax: 385000,
      totalPrice: 4235000
    },

    status: 'CONFIRMED',

    assignment: {
      vehicles: [
        {
          vehicleId: mockVehicleId1,
          driverIds: [mockDriverId],
          staffIds: [mockStaffId1, mockStaffId2, mockStaffId3],
          assignedAt: new Date('2026-01-07T15:00:00')
        }
      ],
      assignmentDate: new Date('2026-01-07T15:00:00')
    },

    overallPhotos: {
      pickupBefore: ['https://example.com/pickup_before.jpg'],
      deliveryAfter: []
    },

    payment: {
      method: 'COD',
      status: 'Pending',
      paidAt: null,
      transactionId: null
    },

    timeline: [
      {
        status: 'CONFIRMED',
        updatedBy: mockDispatcherId,
        updatedAt: new Date('2026-01-07T15:00:00'),
        notes: 'Đã xác nhận với khách hàng'
      }
    ],

    feedback: {
      rating: null,
      driverRating: null,
      comment: null,
      ratedAt: null
    },

    notes: 'Chuyển nhà trọn gói tại Q1',
    createdAt: new Date('2026-01-06T12:00:00'),
    updatedAt: new Date('2026-01-07T15:00:00')
  },

  // TH2: Chuyển items cụ thể (SPECIFIC_ITEMS) - 2 xe (demo parallel)
  {
    code: 'INV_2026_002',

    requestTicketId: new mongoose.Types.ObjectId(),
    customerId: new mongoose.Types.ObjectId(),
    dispatcherId: mockDispatcherId,

    pickup: {
      address: '789 Võ Văn Ngân, Thủ Đức, TP.HCM',
      coordinates: { lat: 10.8013, lng: 106.7629 }
    },

    delivery: {
      address: '321 Lê Lợi, Q1, TP.HCM',
      coordinates: { lat: 10.7725, lng: 106.6992 }
    },

    routeId: new mongoose.Types.ObjectId(),

    scheduledTime: new Date('2026-01-09T07:00:00'),
    scheduledTimeWindow: {
      startTime: '07:00',
      endTime: '13:00'
    },

    deliveryDeadline: new Date('2026-01-09T13:00:00'),

    moveType: 'SPECIFIC_ITEMS',
    surveyType: 'ONLINE',

    services: {
      packing: {
        isAppliedAll: true,
        itemIds: []
      },
      assembling: {
        isAppliedAll: true,
        itemIds: []
      },
      insurance: {
        isAppliedAll: false,
        itemIds: []
      },
      photography: {
        isAppliedAll: false,
        itemIds: []
      }
    },

    items: [
      {
        name: 'Sofa 3 chỗ',
        quantity: 1,
        dimensions: { length: 200, width: 90, height: 80 },
        weight: 80,
        material: 'Vải',
        photos: { before: [], after: [] },
        note: 'Màu xám'
      },
      {
        name: 'Tủ lạnh 2 cánh',
        quantity: 1,
        dimensions: { length: 70, width: 65, height: 170 },
        weight: 100,
        material: 'Kim loại',
        photos: {
          before: ['https://example.com/fridge_before.jpg'],
          after: ['https://example.com/fridge_after.jpg']
        },
        note: 'Hàng LG, cần kiểm tra kĩ'
      },
      {
        name: 'Bàn ăn gỗ',
        quantity: 1,
        dimensions: { length: 150, width: 80, height: 75 },
        weight: 60,
        material: 'Gỗ',
        photos: { before: [], after: [] },
        note: 'Có 4 ghế'
      }
    ],

    resourcePlanning: {
      estimatedPickupTime: 45,
      estimatedDeliveryTime: 30,
      travelTime: 45,
      totalTimeRequired: 120,
      timeAvailable: 360,
      currentTime: new Date('2026-01-09T07:00:00'),
      vehiclesNeeded: 1,
      strategyUsed: 'SINGLE_VEHICLE',
      notes: 'Thời gian thoáng, 1 xe đủ'
    },

    pricing: {
      priceListId: mockPriceListId,
      estimatedDistance: 12,
      totalWeight: 240,
      totalVolume: 3,

      basePrice: 500000, // SPECIFIC_ITEMS base

      servicesFee: {
        packing: 300000,
        assembling: 0,
        insurance: 200000,
        photography: 100000
      },

      staffFee: {
        count: 2,
        pricePerPerson: 180000,
        totalStaffFee: 360000
      },

      vehicleFee: {
        vehicleType: '1T',
        pricePerDay: 800000,
        pricePerHour: 200000,
        totalVehicleFee: 400000
      },

      surcharge: 150000, // Phụ phí Q7-Q1

      promotionId: null,
      discountCode: 'NEWYEAR10',
      discountAmount: 300000,

      subtotal: 2010000,
      tax: 201000,
      totalPrice: 1911000
    },

    status: 'ASSIGNED',

    assignment: {
      vehicles: [
        {
          vehicleId: new mongoose.Types.ObjectId(),
          driverIds: [new mongoose.Types.ObjectId()],
          staffIds: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
          assignedAt: new Date('2026-01-08T16:00:00')
        }
      ],
      assignmentDate: new Date('2026-01-08T16:00:00')
    },

    overallPhotos: {
      pickupBefore: ['https://example.com/living_room_before.jpg'],
      deliveryAfter: []
    },

    payment: {
      method: 'Card',
      status: 'Pending',
      paidAt: null,
      transactionId: null
    },

    timeline: [
      {
        status: 'CONFIRMED',
        updatedBy: mockDispatcherId,
        updatedAt: new Date('2026-01-05T20:00:00'),
        notes: 'Khách hàng đồng ý'
      },
      {
        status: 'ASSIGNED',
        updatedBy: mockDispatcherId,
        updatedAt: new Date('2026-01-08T16:00:00'),
        notes: 'Đã phân công xe và nhân công'
      }
    ],

    feedback: {
      rating: null,
      driverRating: null,
      comment: null,
      ratedAt: null
    },

    notes: 'Chuyển nhà items cụ thể Q7→Q1, có khuyến mãi',
    createdAt: new Date('2026-01-05T17:00:00'),
    updatedAt: new Date('2026-01-08T16:00:00')
  }
];

module.exports = invoiceData;
