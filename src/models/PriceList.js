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

  /* 2. BẬC PHÍ VẬN CHUYỂN (Transport Tiers) */
  transportTiers: [{
    fromKm: Number,
    toKm: Number,
    flatFee: Number,
    pricePerKmBeyond: Number
  }],

  /* 3. GIÁ XE (VehicleCost) - Tính theo loại xe */
  vehiclePricing: [{
    vehicleType: { type: String, enum: ["500KG", "1TON", "1.5TON", "2TON"] },
    basePriceForFirstXKm: Number,
    limitKm: Number,
    pricePerNextKm: Number,
    pricePerHour: Number,
    pricePerDay: Number
  }],

  /* 4. GIÁ NHÂN CÔNG (LaborCost) */
  laborCost: {
    basePricePerPerson: { type: Number, default: 0 },
    pricePerHourPerPerson: { type: Number, default: 0 }
  },

  /* 5. PHÍ QUÃNG ĐƯỜNG & TẦNG LẦU & BƯNG ĐỒ */
  movingSurcharge: {
    freeCarryDistance: Number,
    pricePerExtraMeter: Number,
    distanceSurchargePerKm: Number,
    stairSurchargePerFloor: Number,
    elevatorSurcharge: Number,
    peakHourMultiplier: Number,
    weekendMultiplier: Number
  },

  /* 6. DỊCH VỤ BỔ SUNG */
  additionalServices: {
    packingMaterial: Number,
    packingFee: Number,
    assemblingFee: Number,
    insuranceRate: Number,
    managementFeeRate: Number
  },

  /* 7. PHÍ DỊCH VỤ THEO TỪNG MÓN ĐỒ (Item Service Rates) */
  itemServiceRates: {
    type: Map,
    of: mongoose.Schema.Types.Mixed // Có thể là Number hoặc String "30000"
  },

  /* 8. QUY TẮC TÍNH PHÍ (Pricing Rules) */
  pricingRules: {
    distanceSurcharge: {
      enabled: Boolean,
      pricePerKm: Number,
      freeKm: Number
    },
    volumeSurcharge: {
      enabled: Boolean,
      pricePerM3: Number,
      freeM3: Number
    },
    weightSurcharge: {
      enabled: Boolean,
      pricePerKg: Number,
      freeKg: Number
    }
  },

  /* 9. QUY TẮC KHUYẾN MÃI (Promotion Rules) */
  promotionRules: {
    maxDiscountPercent: Number,
    minOrderAmount: Number
  },

  /* 10. PHÍ KHẢO SÁT */
  surveyFee: {
    offline: Number,
    online: Number
  },

  effectiveFrom: Date,
  effectiveTo: Date
}, { timestamps: true });

module.exports = mongoose.model("PriceList", priceListSchema);