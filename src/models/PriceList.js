const mongoose = require('mongoose');

const priceListSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  
  name: String,
  description: String,

  // Giá cơ bản theo loại chuyển nhà
  basePrice: {
    fullHouse: Number, // Trọn gói nguyên căn nhà
    specificItems: Number // Item cụ thể
  },

  // Giá theo khoảng cách
  distancePricing: [{
    minDistance: Number, // km
    maxDistance: Number,
    pricePerKm: Number
  }],

  // Giá theo trọng lượng
  weightPricing: [{
    minWeight: Number, // kg
    maxWeight: Number,
    pricePerKg: Number
  }],

  // Giá theo thể tích
  volumePricing: [{
    minVolume: Number, // m³
    maxVolume: Number,
    pricePerCubicMeter: Number
  }],

  // Giá dịch vụ bổ sung
  services: {
    packing: Number, // Đóng gói
    assembling: Number, // Tháo lắp
    insurance: Number, // Bảo hiểm
    photography: Number, // Chụp ảnh tài liệu
    professionalSurvey: Number // Khảo sát chuyên nghiệp
  },

  // Phí theo nhân công
  staffPricing: [{
    staffCount: Number,
    pricePerPerson: Number,
    pricePerHour: Number
  }],

  // Phí theo loại xe
  vehiclePricing: [{
    vehicleType: String, // xe tải 500kg, 1 tấn, 2 tấn, 3 tấn
    pricePerDay: Number,
    pricePerHour: Number
  }],

  // Phí khảo sát
  surveyFee: {
    offline: Number, // Khảo sát tại nhà
    online: Number // Khảo sát online (chat, video call)
  },

  // Item mẫu (đối chiếu và tư vấn cho khách)
  sampleItems: [{
    category: String, // sofa, tủ lạnh, tủ quần áo, giường, bàn làm việc, etc.
    name: String,
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    weight: Number,
    material: String,
    packingSize: {
      length: Number,
      width: Number,
      height: Number
    },
    packingWeight: Number, // Bao gồm bao bì
    image: String,
    basePrice: Number // Giá chuyên vận cho item này
  }],

  // Tính áp dụng
  isActive: { type: Boolean, default: true },
  effectiveFrom: Date,
  effectiveTo: Date,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PriceList', priceListSchema);
