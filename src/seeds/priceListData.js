/**
 * Seed PriceList V3 - Time Based + Full Config
 * Usage: node src/seeds/priceListData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const PriceList = require('../models/PriceList');

async function seedPriceList() {
  try {
    const mongoUri =
      process.env.MONGO_URI || 'mongodb://localhost:27017/homs';

    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected');

    await PriceList.deleteMany({});
    console.log('🗑 Old price lists removed');

    const priceListData = {
      code: 'HOMS-TIME-BASED-2026',
      name: 'Bảng giá Time-Based 2026',
      description: 'Tính theo giờ + nhân công + phụ phí đầy đủ',
      isActive: true,
      taxRate: 0.1,

      /* =========================
         1️⃣ BASE PRICE
      ========================== */
      basePrice: {
        minimumCharge: 800000,
        fullHouseBase: 500000,
        specificItemsBase: 300000
      },

      /* =========================
         2️⃣ VEHICLE PRICING
      ========================== */
      vehiclePricing: [
        {
          vehicleType: '500KG',
          basePriceForFirstXKm: 400000,
          limitKm: 5,
          pricePerNextKm: 20000,
          pricePerHour: 150000,
          pricePerDay: 1000000
        },
        {
          vehicleType: '1TON',
          basePriceForFirstXKm: 600000,
          limitKm: 5,
          pricePerNextKm: 25000,
          pricePerHour: 200000,
          pricePerDay: 1400000
        },
        {
          vehicleType: '1.5TON',
          basePriceForFirstXKm: 900000,
          limitKm: 5,
          pricePerNextKm: 30000,
          pricePerHour: 300000,
          pricePerDay: 2000000
        },
        {
          vehicleType: '2TON',
          basePriceForFirstXKm: 1200000,
          limitKm: 5,
          pricePerNextKm: 35000,
          pricePerHour: 400000,
          pricePerDay: 2600000
        }
      ],

      /* =========================
         3️⃣ STAFF PRICING
      ========================== */
      staffPricing: [
        { staffCount: 1, pricePerPerson: 250000, pricePerHour: 60000 },
        { staffCount: 2, pricePerPerson: 220000, pricePerHour: 55000 },
        { staffCount: 3, pricePerPerson: 180000, pricePerHour: 50000 },
        { staffCount: 4, pricePerPerson: 150000, pricePerHour: 45000 },
        { staffCount: 5, pricePerPerson: 130000, pricePerHour: 40000 }
      ],

      /* =========================
         4️⃣ MOVING SURCHARGE
      ========================== */
      movingSurcharge: {
        freeCarryDistance: 15,
        pricePerExtraMeter: 20000,
        distanceSurchargePerKm: 30000,
        stairSurchargePerFloor: 100000,
        elevatorSurcharge: 50000,
        peakHourMultiplier: 1.2,
        weekendMultiplier: 1.15
      },

      /* =========================
         5️⃣ ADDITIONAL SERVICES
      ========================== */
      additionalServices: {
        packingMaterial: 200000,
        packingFee: 300000,
        assemblingFee: 500000,
        insuranceRate: 0.01,        // 1%
        managementFeeRate: 0.05     // 5%
      },

      /* =========================
         6️⃣ SURVEY FEE
      ========================== */
      surveyFee: {
        offline: 300000,
        online: 100000
      },

      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: new Date('2026-12-31')
    };

    const priceList = await PriceList.create(priceListData);

    console.log('\n✅ PriceList created successfully!');
    console.log('📌 ID:', priceList._id);

    await mongoose.connection.close();
    console.log('\n🔒 Connection closed');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error seeding price list:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  seedPriceList();
}

module.exports = seedPriceList;