const mongoose = require("mongoose");

const priceListSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  name: String,
  description: String,

  // Áp dụng cho loại dịch vụ
  serviceScope: {
    type: String,
    enum: ["FULL_HOUSE", "SPECIFIC_ITEMS"]
  },

  /* ------------------------------
     1. Giá cơ bản
  ------------------------------ */
  basePrice: {
    minimumCharge: Number, // giá tối thiểu
    fullHouseBase: Number, // trọn gói
    smallRoomBase: Number  // phòng trọ
  },

  /* ------------------------------
     2. Giá theo KM xe chạy
  ------------------------------ */
  distancePricing: {
    pricePerKm: Number,
    freeKm: Number
  },

  /* ------------------------------
     3. Giá theo thể tích / khối lượng
  ------------------------------ */
  volumePricing: {
    pricePerCubicMeter: Number
  },

  weightPricing: {
    pricePerKg: Number
  },

  /* ------------------------------
     4. Giá NHÂN CÔNG
  ------------------------------ */
  laborPricing: {
    baseStaffCount: Number,
    pricePerStaff: Number,
    pricePerHour: Number,

    overtimeMultiplier: Number // >8h
  },

  /* ------------------------------
     5. Khoảng cách BƯNG ĐỒ (RẤT QUAN TRỌNG)
  ------------------------------ */
  carryPricing: {
    freeDistanceMeter: Number,   // VD: 20m
    pricePerExtraMeter: Number,  // 5.000đ/m

    stairSurchargePerFloor: Number, // +50k/tầng
    noElevatorMultiplier: Number    // x1.3
  },

  /* ------------------------------
     6. Phí theo TẦNG LẦU
  ------------------------------ */
  floorPricing: {
    freeFloor: Number,
    pricePerExtraFloor: Number
  },

  /* ------------------------------
     7. Phí theo LOẠI XE
  ------------------------------ */
  vehiclePricing: [
    {
      vehicleType: String, // 500kg, 1T
      pricePerHour: Number,
      pricePerDay: Number
    }
  ],

  /* ------------------------------
     8. DỊCH VỤ BỔ SUNG
  ------------------------------ */
  additionalServices: {
    packing: Number,
    assembling: Number,
    insuranceRate: Number, // %
    professionalSurvey: Number
  },

  /* ------------------------------
     9. KHẢO SÁT
  ------------------------------ */
  surveyFee: {
    online: Number,
    offline: Number
  },

  /* ------------------------------
     10. ITEM THAM KHẢO (KHÔNG PHẢI BẮT BUỘC)
  ------------------------------ */
  referenceItems: [
    {
      name: String,
      category: String,
      estimatedVolume: Number,
      estimatedWeight: Number,
      suggestedPrice: Number
    }
  ],

  /* ------------------------------
     11. Hiệu lực
  ------------------------------ */
  effectiveFrom: Date,
  effectiveTo: Date,
  isActive: { type: Boolean, default: true }

}, { timestamps: true });

module.exports = mongoose.model("PriceList", priceListSchema);


//TotalPrice =
// BasePrice
// + DistanceCost
// + LaborCost
// + CarryCost
// + FloorCost
// + VehicleCost
// + AdditionalServices