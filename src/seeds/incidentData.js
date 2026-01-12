/**
 * Seed data cho Incident
 * Các sự cố xảy ra trong quá trình vận chuyển
 */

const mongoose = require('mongoose');

const mockOrderId = new mongoose.Types.ObjectId();
const mockReporterId = new mongoose.Types.ObjectId();

const incidentData = [
  {
    orderId: mockOrderId,
    reporterId: mockReporterId,
    type: 'Delay',
    description: 'Xe bị tắc đường tại Q1, gây trễ 30 phút',
    images: ['https://example.com/incident1.jpg'],
    status: 'Resolved'
  },
  {
    orderId: new mongoose.Types.ObjectId(),
    reporterId: new mongoose.Types.ObjectId(),
    type: 'Damage',
    description: 'Sofa bị cứa trong quá trình vận chuyển',
    images: ['https://example.com/damage1.jpg', 'https://example.com/damage2.jpg'],
    status: 'Open'
  },
  {
    orderId: new mongoose.Types.ObjectId(),
    reporterId: new mongoose.Types.ObjectId(),
    type: 'Accident',
    description: 'Xe gặp tai nạn nhẹ tại giao lộ, không có thiệt hại hàng hóa',
    images: [],
    status: 'Resolved'
  }
];

module.exports = incidentData;
