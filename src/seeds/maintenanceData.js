const mongoose = require('mongoose');

const mockVehicleId1 = new mongoose.Types.ObjectId();
const mockVehicleId2 = new mongoose.Types.ObjectId();
const mockMechanicId = new mongoose.Types.ObjectId();
const mockCreatedById = new mongoose.Types.ObjectId();

const maintenanceData = [
  {
    vehicleId: mockVehicleId1,
    maintenanceType: 'Oil Change',
    description: 'Thay dầu động cơ và lọc dầu định kỳ 5000km',
    scheduledStartDate: new Date('2026-01-15T08:00:00'),
    scheduledEndDate: new Date('2026-01-15T10:00:00'),
    actualStartDate: new Date('2026-01-15T08:30:00'),
    actualEndDate: new Date('2026-01-15T10:15:00'),
    status: 'Completed',
    cost: 500000,
    costDetails: 'Dầu Motor 5L + Lọc dầu',
    mechanic: mockMechanicId,
    createdBy: mockCreatedById,
    notes: 'Hoàn thành đúng hạn, xe chạy tốt'
  },
  {
    vehicleId: mockVehicleId1,
    maintenanceType: 'Tire Replacement',
    description: 'Kiểm tra và thay vỏ xe nếu cần',
    scheduledStartDate: new Date('2026-02-01T09:00:00'),
    scheduledEndDate: new Date('2026-02-01T11:00:00'),
    status: 'Scheduled',
    cost: 0,
    costDetails: null,
    mechanic: mockMechanicId,
    createdBy: mockCreatedById,
    notes: 'Vỏ còn tốt, có thể kiểm tra lại sau 2000km'
  },
  {
    vehicleId: mockVehicleId2,
    maintenanceType: 'Brake Service',
    description: 'Kiểm tra và bảo trì hệ thống phanh',
    scheduledStartDate: new Date('2026-01-20T10:00:00'),
    scheduledEndDate: new Date('2026-01-20T14:00:00'),
    actualStartDate: new Date('2026-01-20T10:15:00'),
    actualEndDate: new Date('2026-01-20T13:45:00'),
    status: 'Completed',
    cost: 800000,
    costDetails: 'Thay đĩ phanh trước + Kiểm tra hệ thống',
    mechanic: mockMechanicId,
    createdBy: mockCreatedById,
    notes: 'Phát hiện mài phanh mạnh, đã thay đĩa mới'
  },
  {
    vehicleId: mockVehicleId2,
    maintenanceType: 'Engine Inspection',
    description: 'Kiểm tra toàn bộ động cơ định kỳ hàng năm',
    scheduledStartDate: new Date('2026-03-01T08:00:00'),
    scheduledEndDate: new Date('2026-03-01T12:00:00'),
    status: 'Scheduled',
    cost: 0,
    costDetails: null,
    mechanic: mockMechanicId,
    createdBy: mockCreatedById,
    notes: 'Kiểm tra định kỳ hàng năm'
  }
];

module.exports = maintenanceData;
