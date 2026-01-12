/**
 * Seed data cho Notification
 * Thông báo cho người dùng
 */

const mongoose = require('mongoose');

const mockUserId1 = new mongoose.Types.ObjectId();
const mockUserId2 = new mongoose.Types.ObjectId();
const mockUserId3 = new mongoose.Types.ObjectId();

const notificationData = [
  {
    userId: mockUserId1,
    title: 'Đơn hàng được xác nhận',
    message: 'Đơn hàng INV_2026_001 đã được xác nhận và sắp được vận chuyển',
    type: 'Order',
    isRead: true
  },
  {
    userId: mockUserId1,
    title: 'Xe sắp đến',
    message: 'Xe vận chuyển sẽ đến trong 30 phút. Vui lòng chuẩn bị sẵn sàng',
    type: 'Order',
    isRead: true
  },
  {
    userId: mockUserId2,
    title: 'Khuyến mãi mới',
    message: 'Khuyến mãi giảm giá 20% cho khách hàng mới. Sử dụng code NEWYEAR20',
    type: 'Promotion',
    isRead: false
  },
  {
    userId: mockUserId2,
    title: 'Cập nhật hệ thống',
    message: 'Hệ thống sẽ bảo trì từ 2:00 AM - 4:00 AM ngày mai',
    type: 'System',
    isRead: false
  },
  {
    userId: mockUserId3,
    title: 'Chuyến hàng hoàn thành',
    message: 'Chuyến hàng INV_2026_002 đã được giao thành công',
    type: 'Order',
    isRead: true
  },
  {
    userId: mockUserId1,
    title: 'Đánh giá chuyến hàng',
    message: 'Vui lòng đánh giá chuyến hàng vừa rồi để giúp chúng tôi cải thiện dịch vụ',
    type: 'Order',
    isRead: false
  }
];

module.exports = notificationData;
