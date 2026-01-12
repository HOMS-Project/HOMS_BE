const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  
  name: String,
  description: String,

  // Khu vực/quận/huyện
  area: String,
  district: String,

  // Tuyến đường chi tiết
  routes: [{
    routeName: String,
    startPoint: {
      address: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    endPoint: {
      address: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    },
    distance: Number, // km
    estimatedDuration: Number, // phút
    
    // Khung giờ cho phép chuyển nhà (tránh vi phạm luật giao thông)
    allowedTimeSlots: [{
      dayOfWeek: String, // Monday, Tuesday, etc. hoặc 'All'
      startTime: String, // HH:mm format, e.g., "06:00"
      endTime: String,   // HH:mm format, e.g., "22:00"
      notes: String // Ghi chú về giới hạn lưu lượng, tắc đường, etc.
    }],

    // Hạn chế (tháng, ngày, giờ cao điểm)
    restrictions: [{
      restrictionType: String, // PEAK_HOURS, HOLIDAYS, WEATHER, TRAFFIC
      description: String,
      startTime: String,
      endTime: String
    }],

    // Chi phí chuyên biệt cho tuyến đường này (nếu có)
    surcharge: Number, // Tính thêm
    discountRate: Number // Giảm giá (%)
  }],

  // Loại xe phù hợp
  compatibleVehicles: [String], // 500kg, 1T, 2T, 3T, etc.

  // Số lượng nhân công đề xuất
  recommendedStaffCount: Number,

  // Thời gian tối ưu
  bestTimeWindow: {
    startHour: Number,
    endHour: Number,
    notes: String
  },

  // Khung giờ cao điểm
  peakHours: [{
    dayOfWeek: String,
    startHour: Number,
    endHour: Number
  }],

  // Các hạn chế/lưu ý
  notes: String,

  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Route', routeSchema);
