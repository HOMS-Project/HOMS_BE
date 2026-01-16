const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema({
  code: { type: String, unique: true }, // VD: HCM-Q1-Q7
  name: String,
  description: String,

  // Khu vực áp dụng
  area: String,        // HCM, HN
  districts: [String],// Q1, Q3, Q7...

  // Điểm đầu - cuối logic (không phải GPS tracking)
  startZone: String,
  endZone: String,

  estimatedDistanceKm: Number,
  estimatedDurationMin: Number,

  // 🚦 Quy định lưu thông (GỘP giờ cấm + cao điểm)
  trafficRules: [
    {
      ruleType: {
        type: String,
        enum: ["PEAK_HOUR", "TRUCK_BAN", "HOLIDAY", "WEATHER"]
      },

      daysOfWeek: [String], // Monday → Sunday
      startTime: String,    // "06:00"
      endTime: String,      // "09:00"

      restrictedVehicles: [String], // 2T, 3T...
      note: String
    }
  ],

  // Xe được khuyến nghị
  compatibleVehicles: [String], // 500kg, 1T, 2T

  // Gợi ý nhân lực
  recommendedStaff: {
    min: Number,
    max: Number
  },

  // Phụ phí theo tuyến
  routeSurcharge: Number, // VNĐ
  routeDiscountRate: Number, // %

  notes: String,
  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model("Route", routeSchema);
