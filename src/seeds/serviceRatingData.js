const mongoose = require('mongoose');

const mockOrderId1 = new mongoose.Types.ObjectId();
const mockOrderId2 = new mongoose.Types.ObjectId();
const mockCustomerId1 = new mongoose.Types.ObjectId();
const mockCustomerId2 = new mongoose.Types.ObjectId();
const mockDriverId1 = new mongoose.Types.ObjectId();
const mockDriverId2 = new mongoose.Types.ObjectId();

const serviceRatingData = [
  {
    orderId: mockOrderId1,
    customerId: mockCustomerId1,
    driverId: mockDriverId1,
    ratingType: 'Service',
    rating: 5,
    categories: {
      cleanliness: 5,
      professionalism: 5,
      punctuality: 5,
      communication: 5,
      safety: 5
    },
    comment: 'Dịch vụ xuất sắc, nhân viên rất chuyên nghiệp và thân thiện. Sẽ sử dụng lại!',
    images: ['https://example.com/rating1.jpg'],
    status: 'Active',
    ratedAt: new Date('2026-01-08T15:30:00')
  },
  {
    orderId: mockOrderId1,
    customerId: mockCustomerId1,
    driverId: mockDriverId1,
    ratingType: 'Driver',
    rating: 5,
    categories: {
      cleanliness: 5,
      professionalism: 5,
      punctuality: 5,
      communication: 4,
      safety: 5
    },
    comment: 'Tài xế rất chuyên nghiệp, lái xe an toàn và cẩn thận với đồ đạc',
    images: [],
    status: 'Active',
    ratedAt: new Date('2026-01-08T15:35:00')
  },
  {
    orderId: mockOrderId2,
    customerId: mockCustomerId2,
    driverId: mockDriverId2,
    ratingType: 'Service',
    rating: 4,
    categories: {
      cleanliness: 4,
      professionalism: 4,
      punctuality: 4,
      communication: 5,
      safety: 5
    },
    comment: 'Dịch vụ tốt, nhưng hơi trễ 15 phút. Nhân viên rất lịch sự và giúp đỡ',
    images: [],
    status: 'Active',
    ratedAt: new Date('2026-01-09T14:20:00')
  },
  {
    orderId: mockOrderId2,
    customerId: mockCustomerId2,
    driverId: mockDriverId2,
    ratingType: 'Vehicle',
    rating: 3,
    categories: {
      cleanliness: 3,
      professionalism: 4,
      punctuality: 4,
      communication: 4,
      safety: 4
    },
    comment: 'Xe cần được vệ sinh kỹ hơn, nhưng tình trạng chung là tốt',
    images: ['https://example.com/vehicle_rating.jpg'],
    status: 'Active',
    ratedAt: new Date('2026-01-09T14:25:00')
  },
  {
    orderId: new mongoose.Types.ObjectId(),
    customerId: new mongoose.Types.ObjectId(),
    driverId: mockDriverId1,
    ratingType: 'Service',
    rating: 2,
    categories: {
      cleanliness: 2,
      professionalism: 2,
      punctuality: 1,
      communication: 2,
      safety: 3
    },
    comment: 'Trễ 1 tiếng, nhân viên không lịch sự lắm. Sẽ tìm công ty khác',
    images: [],
    status: 'Flagged',
    ratedAt: new Date('2026-01-10T10:00:00')
  }
];

module.exports = serviceRatingData;
