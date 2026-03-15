const pricingCalculationService = require('../src/services/pricingCalculationService');

async function test() {
  const mockPriceList = {
    code: "STD-2026",
    name: "Bảng giá 2026",
    isActive: true,
    taxRate: 0.1,
    basePrice: {
      minimumCharge: 500000,
      fullHouseBase: 300000,
      specificItemsBase: 200000
    },
    transportTiers: [
      { fromKm: 0, toKm: 5, flatFee: 500000, pricePerKmBeyond: 0 },
      { fromKm: 5, toKm: 10, flatFee: 700000, pricePerKmBeyond: 0 },
      { fromKm: 10, toKm: 20, flatFee: 1000000, pricePerKmBeyond: 0 },
      { fromKm: 20, toKm: null, flatFee: 1000000, pricePerKmBeyond: 20000 }
    ],
    vehiclePricing: [
      {
        vehicleType: "500KG",
        basePriceForFirstXKm: 500000,
        limitKm: 5,
        pricePerNextKm: 8000,
        pricePerHour: 80000,
        pricePerDay: 600000
      }
    ],
    laborCost: {
      basePricePerPerson: 0,
      pricePerHourPerPerson: 80000
    },
    movingSurcharge: {
      freeCarryDistance: 15,
      pricePerExtraMeter: 2000,
      stairSurchargePerFloor: 50000,
      elevatorSurcharge: 20000
    },
    additionalServices: {
      packingFee: 200000,
      assemblingFee: 300000,
      insuranceRate: 0.01,
      managementFeeRate: 0.05
    },
    itemServiceRates: {
      "TV": 50000,
      "FRIDGE": 100000,
      "OTHER": 30000
    },
    pricingRules: {
      distanceSurcharge: { enabled: true, pricePerKm: 10000, freeKm: 5 },
      volumeSurcharge: { enabled: true, pricePerM3: 50000, freeM3: 1 },
      weightSurcharge: { enabled: true, pricePerKg: 5000, freeKg: 100 }
    }
  };

  const mockSurveyData = {
    suggestedVehicle: "500KG",
    suggestedStaffCount: 2,
    distanceKm: 25,
    carryMeter: 20,
    floors: 3,
    hasElevator: false,
    totalActualVolume: 2,
    totalActualWeight: 150,
    needsAssembling: true,
    items: [
      { name: "TV" },
      { name: "FRIDGE" },
      { name: "CHAIR" } // should be OTHER
    ]
  };

  try {
    const result = await pricingCalculationService.calculatePricing(mockSurveyData, mockPriceList);
    console.log("--- RESULTS ---");
    console.log("Subtotal:", result.subtotal);
    console.log("Tax:", result.tax);
    console.log("Total Price:", result.totalPrice);
    console.log("Minimum Applied:", result.minimumChargeApplied);
    console.log("--- BREAKDOWN ---");
    Object.entries(result.breakdown).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
  } catch (error) {
    console.error("Calculation Error:", error);
  }
}

test();
