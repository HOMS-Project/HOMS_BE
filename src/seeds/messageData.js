/**
 * Seed data cho Message
 * Tin nhắn giữa khách hàng và nhân viên
 */

const mongoose = require('mongoose');

const mockOrderId1 = new mongoose.Types.ObjectId();
const mockOrderId2 = new mongoose.Types.ObjectId();
const mockCustomerId = new mongoose.Types.ObjectId();
const mockDriverId = new mongoose.Types.ObjectId();
const mockDispatcherId = new mongoose.Types.ObjectId();

const messageData = [
  {
    orderId: mockOrderId1,
    senderId: mockCustomerId,
    content: 'Xin chào, tôi muốn đặt lịch chuyển nhà vào ngày 8/1',
    type: 'Text',
    isRead: true
  },
  {
    orderId: mockOrderId1,
    senderId: mockDispatcherId,
    content: 'Cảm ơn bạn, chúng tôi sẽ liên hệ với bạn trong vòng 1 giờ để xác nhận',
    type: 'Text',
    isRead: true
  },
  {
    orderId: mockOrderId1,
    senderId: mockCustomerId,
    content: 'Cảm ơn, tôi chờ cuộc gọi từ bạn',
    type: 'Text',
    isRead: true
  },
  {
    orderId: mockOrderId1,
    senderId: mockDriverId,
    content: 'Chúc mừng, tôi là tài xế sẽ vận chuyển hôm đó. Tôi sẽ đến lúc 8:00 sáng',
    type: 'Text',
    isRead: true
  },
  {
    orderId: mockOrderId1,
    senderId: mockDriverId,
    content: 'https://example.com/location.jpg',
    type: 'Location',
    isRead: false
  },
  {
    orderId: mockOrderId2,
    senderId: mockCustomerId,
    content: 'Có cần chuẩn bị gì không?',
    type: 'Text',
    isRead: false
  },
  {
    orderId: mockOrderId2,
    senderId: mockDispatcherId,
    content: 'Vâng, vui lòng dọn dẹp khu vực pickup và chuẩn bị đóng gói',
    type: 'Text',
    isRead: false
  }
];

module.exports = messageData;
