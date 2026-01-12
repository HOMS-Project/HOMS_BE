/**
 * Seed data cho PriceList
 */

const priceListData = [
  {
    code: 'PRICELIST_DEFAULT_2026',
    name: 'Bảng giá mặc định 2026',
    description: 'Bảng giá tiêu chuẩn cho dịch vụ chuyển nhà',

    basePrice: {
      fullHouse: 2000000, // 2M - trọn gói
      specificItems: 500000 // 500K - item cụ thể
    },

    distancePricing: [
      { minDistance: 0, maxDistance: 5, pricePerKm: 50000 },
      { minDistance: 5, maxDistance: 10, pricePerKm: 40000 },
      { minDistance: 10, maxDistance: 20, pricePerKm: 30000 },
      { minDistance: 20, maxDistance: 9999, pricePerKm: 25000 }
    ],

    weightPricing: [
      { minWeight: 0, maxWeight: 500, pricePerKg: 5000 },
      { minWeight: 500, maxWeight: 1000, pricePerKg: 4000 },
      { minWeight: 1000, maxWeight: 2000, pricePerKg: 3000 },
      { minWeight: 2000, maxWeight: 9999, pricePerKg: 2500 }
    ],

    volumePricing: [
      { minVolume: 0, maxVolume: 5, pricePerCubicMeter: 100000 },
      { minVolume: 5, maxVolume: 10, pricePerCubicMeter: 80000 },
      { minVolume: 10, maxVolume: 20, pricePerCubicMeter: 60000 },
      { minVolume: 20, maxVolume: 9999, pricePerCubicMeter: 50000 }
    ],

    services: {
      packing: 300000, // 300K - đóng gói
      assembling: 500000, // 500K - tháo lắp
      insurance: 200000, // 200K - bảo hiểm
      photography: 100000, // 100K - chụp ảnh
      professionalSurvey: 150000 // 150K - khảo sát chuyên nghiệp
    },

    staffPricing: [
      { staffCount: 1, pricePerPerson: 200000, pricePerHour: 50000 },
      { staffCount: 2, pricePerPerson: 180000, pricePerHour: 45000 },
      { staffCount: 3, pricePerPerson: 150000, pricePerHour: 40000 },
      { staffCount: 4, pricePerPerson: 120000, pricePerHour: 35000 },
      { staffCount: 5, pricePerPerson: 100000, pricePerHour: 30000 }
    ],

    vehiclePricing: [
      { vehicleType: '500kg', pricePerDay: 500000, pricePerHour: 150000 },
      { vehicleType: '1T', pricePerDay: 800000, pricePerHour: 200000 },
      { vehicleType: '2T', pricePerDay: 1200000, pricePerHour: 300000 },
      { vehicleType: '3T', pricePerDay: 1500000, pricePerHour: 400000 }
    ],

    surveyFee: {
      offline: 300000, // 300K - khảo sát offline
      online: 100000 // 100K - khảo sát online
    },

    sampleItems: [
      {
        category: 'Furniture',
        name: 'Sofa 3 chỗ',
        dimensions: { length: 200, width: 90, height: 80 },
        weight: 80,
        material: 'Vải',
        packingSize: { length: 210, width: 100, height: 90 },
        packingWeight: 95,
        image: 'https://example.com/sofa.jpg',
        basePrice: 500000
      },
      {
        category: 'Appliances',
        name: 'Tủ lạnh 2 cánh',
        dimensions: { length: 70, width: 65, height: 170 },
        weight: 100,
        material: 'Kim loại',
        packingSize: { length: 80, width: 75, height: 180 },
        packingWeight: 120,
        image: 'https://example.com/fridge.jpg',
        basePrice: 300000
      },
      {
        category: 'Furniture',
        name: 'Tủ quần áo 4 cánh',
        dimensions: { length: 200, width: 50, height: 220 },
        weight: 120,
        material: 'Gỗ',
        packingSize: { length: 210, width: 60, height: 230 },
        packingWeight: 140,
        image: 'https://example.com/wardrobe.jpg',
        basePrice: 600000
      },
      {
        category: 'Furniture',
        name: 'Giường đôi',
        dimensions: { length: 200, width: 160, height: 50 },
        weight: 100,
        material: 'Gỗ',
        packingSize: { length: 210, width: 170, height: 60 },
        packingWeight: 120,
        image: 'https://example.com/bed.jpg',
        basePrice: 400000
      },
      {
        category: 'Furniture',
        name: 'Bàn làm việc',
        dimensions: { length: 120, width: 60, height: 75 },
        weight: 40,
        material: 'Gỗ',
        packingSize: { length: 130, width: 70, height: 85 },
        packingWeight: 50,
        image: 'https://example.com/desk.jpg',
        basePrice: 300000
      }
    ],

    isActive: true,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: new Date('2026-12-31'),
    createdAt: new Date('2026-01-01')
  }
];

module.exports = priceListData;
