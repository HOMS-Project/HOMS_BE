const mongoose = require("mongoose");

/* VehicleCost - Tính theo loại xe */
const vehiclePricingSchema = new mongoose.Schema({
  vehicleType: { type: String, enum: ["500KG", "1TON", "1.5TON", "2TON"], required: true },
  basePriceForFirstXKm: { type: Number, required: true },  // Giá mở cửa (e.g. 500k cho 5km đầu)
  limitKm: { type: Number, required: true },               // Số km trong giá mở cửa
  pricePerNextKm: { type: Number, required: true },        // Giá mỗi km tiếp theo ngoài limit
  pricePerHour: { type: Number, required: true },          // Giá theo giờ (time-based fallback)
  pricePerDay: { type: Number, required: true }            // Giá theo ngày
}, { _id: false });

/* Tiered Base Transport Cost
 * Ví dụ thực tế:
 *   { fromKm: 0,  toKm: 5,  flatFee: 500000,  pricePerKmBeyond: 0 }
 *   { fromKm: 5,  toKm: 10, flatFee: 700000,  pricePerKmBeyond: 0 }
 *   { fromKm: 10, toKm: 20, flatFee: 1000000, pricePerKmBeyond: 0 }
 *   { fromKm: 20, toKm: null, flatFee: 1000000, pricePerKmBeyond: 20000 } ← last tier = flatFee + (km-20)*pricePerKmBeyond
 */
const transportTierSchema = new mongoose.Schema({
  fromKm: { type: Number, required: true },
  toKm: { type: Number, default: null },            // null = unlimited (last tier)
  flatFee: { type: Number, required: true },        // Base fee for this tier
  pricePerKmBeyond: { type: Number, default: 0 }    // Extra per km beyond fromKm (used in last tier)
}, { _id: false });

/* LaborCost */
const staffPricingSchema = new mongoose.Schema({
  basePricePerPerson: { type: Number, required: true, default: 0 }, // Flat fee per person (legacy compat)
  pricePerHourPerPerson: { type: Number, required: true }           // Hourly rate per person (primary)
}, { _id: false });

/* MovingSurcharge */
const movingSurchargeSchema = new mongoose.Schema({
  freeCarryDistance: { type: Number, default: 15 },          // Miễn phí X mét khiêng bộ đầu (VD: 15m)
  pricePerExtraMeter: { type: Number, default: 2000 },       // Giá mỗi m khiêng bộ thêm
  distanceSurchargePerKm: { type: Number, default: 0 },      // Phí bổ sung riêng cho khoảng cách
  stairSurchargePerFloor: { type: Number, default: 50000 },  // Phí lên xuống cầu thang bộ /tầng
  elevatorSurcharge: { type: Number, default: 20000 },       // Phí sử dụng thang máy /tầng
  peakHourMultiplier: { type: Number, default: 1.2 },        // Hệ số giờ cao điểm
  weekendMultiplier: { type: Number, default: 1.15 }         // Hệ số cuối tuần
}, { _id: false });

/* AdditionalServices */
const additionalServicesSchema = new mongoose.Schema({
  packingMaterial: { type: Number, default: 0 },             // Phí thùng carton, màng co
  packingFee: { type: Number, default: 0 },                  // Phí dịch vụ đóng gói
  assemblingFee: { type: Number, default: 0 },               // Phí tháo lắp tủ, giường, máy lạnh
  insuranceRate: { type: Number, default: 0.01 },            // % giá trị khai báo
  insuranceMinimum: { type: Number, default: 50000 },        // Phí bảo hiểm tối thiểu
  insuranceMaximum: { type: Number, default: 5000000 },      // Phí bảo hiểm tối đa
  managementFeeRate: { type: Number, default: 0.05 }         // % phí quản lý tính từ subtotal
}, { _id: false });

/* Per-Item Service Rates (phí dịch vụ theo từng loại đồ vật) */
const itemServiceRatesSchema = new mongoose.Schema({
  TV: { type: Number, default: 50000 },
  FRIDGE: { type: Number, default: 100000 },
  BED: { type: Number, default: 150000 },
  SOFA: { type: Number, default: 80000 },
  WARDROBE: { type: Number, default: 100000 },
  AC: { type: Number, default: 80000 },
  WASHING_MACHINE: { type: Number, default: 80000 },
  OTHER: { type: Number, default: 30000 }
}, { _id: false });

/* SurveyFee */
const surveyFeeSchema = new mongoose.Schema({
  offline: { type: Number, default: 100000 },
  online: { type: Number, default: 0 }
}, { _id: false });

/* ===== PriceList (Master Rate Card) ===== */
const priceListSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true, trim: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  taxRate: { type: Number, default: 0.1 },

  /* Base Price */
  basePrice: {
    minimumCharge: { type: Number, min: 0, default: 500000 },    // Giá sàn tối thiểu
    fullHouseBase: { type: Number, min: 0, default: 300000 },    // Phí quản lý dọn trọn gói
    specificItemsBase: { type: Number, min: 0, default: 200000 } // Phí quản lý dọn đồ lẻ
  },

  /* Tiered Base Transport Cost (replaces old flat per-km rate) */
  transportTiers: [transportTierSchema],

  /* Vehicle Pricing */
  vehiclePricing: [vehiclePricingSchema],

  /* Labor Cost */
  laborCost: staffPricingSchema,

  /* Moving Surcharge (carry, floors, multipliers) */
  movingSurcharge: movingSurchargeSchema,

  /* Additional Services */
  additionalServices: additionalServicesSchema,

  /* Per-Item Service Rates */
  itemServiceRates: itemServiceRatesSchema,

  /* Survey Fee */
  surveyFee: surveyFeeSchema,

  /* Pricing Rules (volume/weight surcharge) */
  pricingRules: {
    distanceSurcharge: {
      enabled: { type: Boolean, default: true },
      pricePerKm: { type: Number, default: 10000 },
      freeKm: { type: Number, default: 5 }
    },
    volumeSurcharge: {
      enabled: { type: Boolean, default: true },
      pricePerM3: { type: Number, default: 50000 },
      freeM3: { type: Number, default: 1 }
    },
    weightSurcharge: {
      enabled: { type: Boolean, default: true },
      pricePerKg: { type: Number, default: 5000 },
      freeKg: { type: Number, default: 100 }
    }
  },

  /* Promotion Rules */
  promotionRules: {
    maxDiscountPercent: { type: Number, default: 20 },
    minOrderAmount: { type: Number, default: 1000000 }
  },

  /* Effective Dates */
  effectiveFrom: Date,
  effectiveTo: Date
}, { timestamps: true });

module.exports = mongoose.model("PriceList", priceListSchema);