/**
 * Seed data cho Route
 * Các tuyến đường trong TP.HCM
 */

const routeData = [
  {
    code: 'ROUTE_Q1_TO_Q3',
    name: 'Quận 1 → Quận 3',
    description: 'Tuyến từ trung tâm Q1 đến Q3',
    area: 'Tp.HCM',
    district: 'Q1-Q3',

    routes: [
      {
        routeName: 'Ben Thanh - Tan Dinh',
        startPoint: {
          address: 'Bến Thành, Q1',
          coordinates: { lat: 10.7725, lng: 106.6992 }
        },
        endPoint: {
          address: 'Tân Định, Q3',
          coordinates: { lat: 10.7869, lng: 106.6780 }
        },
        distance: 3,
        estimatedDuration: 15,

        allowedTimeSlots: [
          { dayOfWeek: 'All', startTime: '06:00', endTime: '22:00', notes: 'Vận chuyển thường' },
          { dayOfWeek: 'Saturday', startTime: '08:00', endTime: '20:00', notes: 'Giảm lưu lượng cuối tuần' }
        ],

        restrictions: [
          { restrictionType: 'PEAK_HOURS', description: 'Giờ cao điểm sáng', startTime: '07:00', endTime: '09:00' },
          { restrictionType: 'PEAK_HOURS', description: 'Giờ cao điểm chiều', startTime: '17:00', endTime: '19:00' }
        ],

        surcharge: 0,
        discountRate: 0
      }
    ],

    compatibleVehicles: ['500kg', '1T', '2T'],
    recommendedStaffCount: 2,
    bestTimeWindow: { startHour: 9, endHour: 17, notes: 'Ngoài giờ cao điểm' },
    peakHours: [
      { dayOfWeek: 'Weekday', startHour: 7, endHour: 9 },
      { dayOfWeek: 'Weekday', startHour: 17, endHour: 19 }
    ],
    notes: 'Tuyến chính trong Q1-Q3, tránh giờ cao điểm',
    isActive: true,
    createdAt: new Date('2026-01-01')
  },

  {
    code: 'ROUTE_Q7_TO_Q1',
    name: 'Quận 7 → Quận 1',
    description: 'Tuyến từ Q7 (Phú Mỹ Hưng) đến trung tâm Q1',
    area: 'Tp.HCM',
    district: 'Q7-Q1',

    routes: [
      {
        routeName: 'Phu My Hung - District 1',
        startPoint: {
          address: 'Phú Mỹ Hưng, Q7',
          coordinates: { lat: 10.7195, lng: 106.7009 }
        },
        endPoint: {
          address: 'Bến Thành, Q1',
          coordinates: { lat: 10.7725, lng: 106.6992 }
        },
        distance: 8,
        estimatedDuration: 30,

        allowedTimeSlots: [
          { dayOfWeek: 'All', startTime: '06:00', endTime: '23:00', notes: 'Vận chuyển 24/7' }
        ],

        restrictions: [
          { restrictionType: 'PEAK_HOURS', description: 'Giờ cao điểm sáng', startTime: '07:00', endTime: '09:00' },
          { restrictionType: 'PEAK_HOURS', description: 'Giờ cao điểm chiều', startTime: '17:00', endTime: '20:00' }
        ],

        surcharge: 100000, // Phụ phí khu vực Q7
        discountRate: 0
      }
    ],

    compatibleVehicles: ['500kg', '1T', '2T', '3T'],
    recommendedStaffCount: 2,
    bestTimeWindow: { startHour: 10, endHour: 16, notes: 'Ngoài giờ cao điểm' },
    peakHours: [
      { dayOfWeek: 'Weekday', startHour: 7, endHour: 9 },
      { dayOfWeek: 'Weekday', startHour: 17, endHour: 20 }
    ],
    notes: 'Tuyến dài, cần tính phụ phí Q7',
    isActive: true,
    createdAt: new Date('2026-01-01')
  },

  {
    code: 'ROUTE_Q2_TO_Q9',
    name: 'Quận 2 → Quận 9',
    description: 'Tuyến từ Q2 (Thảo Điền) đến Q9 (Khu căn cứ)',
    area: 'Tp.HCM',
    district: 'Q2-Q9',

    routes: [
      {
        routeName: 'Thao Dien - District 9',
        startPoint: {
          address: 'Thảo Điền, Q2',
          coordinates: { lat: 10.8013, lng: 106.7629 }
        },
        endPoint: {
          address: 'Khu căn cứ, Q9',
          coordinates: { lat: 10.8345, lng: 106.8165 }
        },
        distance: 12,
        estimatedDuration: 45,

        allowedTimeSlots: [
          { dayOfWeek: 'All', startTime: '06:00', endTime: '22:00', notes: 'Vận chuyển thường' }
        ],

        restrictions: [
          { restrictionType: 'PEAK_HOURS', description: 'Giờ cao điểm sáng', startTime: '06:30', endTime: '08:30' },
          { restrictionType: 'PEAK_HOURS', description: 'Giờ cao điểm chiều', startTime: '17:00', endTime: '19:00' }
        ],

        surcharge: 150000, // Phụ phí khu vực Q2-Q9
        discountRate: 0
      }
    ],

    compatibleVehicles: ['1T', '2T', '3T'],
    recommendedStaffCount: 3,
    bestTimeWindow: { startHour: 9, endHour: 17, notes: 'Ngoài giờ cao điểm' },
    peakHours: [
      { dayOfWeek: 'Weekday', startHour: 6, endHour: 8 },
      { dayOfWeek: 'Weekday', startHour: 17, endHour: 19 }
    ],
    notes: 'Tuyến dài nhất, cần xe lớn và nhân công nhiều',
    isActive: true,
    createdAt: new Date('2026-01-01')
  }
];

module.exports = routeData;
