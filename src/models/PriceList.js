const mongoose = require("mongoose");

const priceListSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  name: String,
  description: String,
  isActive: { type: Boolean, default: true },
  taxRate: { type: Number, default: 0.1 },

  /* 1. GIÁ CƠ BẢN (Theo gói dịch vụ) */
  basePrice: {
    minimumCharge: Number, // Giá sàn không thể thấp hơn
    fullHouseBase: Number, // Phí quản lý cho dọn trọn gói
    specificItemsBase: Number // Phí quản lý cho dọn đồ lẻ
  },

  /* 2. GIÁ XE (VehicleCost) - Tính theo loại xe */
  vehiclePricing: [{
    vehicleType: { type: String, enum: ["500KG", "1TON", "1.5TON", "2TON"] },
    // Hỗ trợ cả distance-based và time-based
    basePriceForFirstXKm: Number, // Giá mở cửa (ví dụ 4km đầu)
    limitKm: Number,              // Số km được bao gồm trong giá mở cửa
    pricePerNextKm: Number,       // Giá mỗi km tiếp theo
    pricePerHour: Number,         // Giá theo giờ (time-based)
    pricePerDay: Number           // Giá theo ngày
  }],

  /* 3. GIÁ NHÂN CÔNG (LaborCost) */
  staffPricing: [{
    staffCount: Number,
    pricePerPerson: Number,
    pricePerHour: Number
  }],

  /* 4. PHÍ QUÃNG ĐƯỜNG & TẦNG LẦU & BƯNG ĐỒ */
  movingSurcharge: {
    freeCarryDistance: Number,      // Miễn phí X mét đầu (VD: 15m)
    pricePerExtraMeter: Number,     // Giá mỗi mét khiêng bộ thêm
    distanceSurchargePerKm: Number, // Phí bổ sung cho khoảng cách (nếu tính riêng)
    stairSurchargePerFloor: Number, // Phí lên xuống cầu thang bộ (không thang máy)
    elevatorSurcharge: Number,      // Phí sử dụng thang máy (thấp hơn thang bộ)
    peakHourMultiplier: Number,     // Hệ số giờ cao điểm
    weekendMultiplier: Number       // Hệ số cuối tuần
  },

  /* 5. DỊCH VỤ BỔ SUNG */
  additionalServices: {
    packingMaterial: Number,    // Phí thùng carton, màng co
    packingFee: Number,         // Phí dịch vụ đóng gói (nếu khách yêu cầu)
    assemblingFee: Number,      // Phí tháo lắp tủ, giường, máy lạnh
    insuranceRate: Number,      // % giá trị khai báo
    managementFeeRate: Number   // % phí quản lý từ subtotal
  },

  /* 6. PHÍ KHẢO SÁT */
  surveyFee: {
    offline: Number,
    online: Number
  },

  effectiveFrom: Date,
  effectiveTo: Date
}, { timestamps: true });

module.exports = mongoose.model("PriceList", priceListSchema);