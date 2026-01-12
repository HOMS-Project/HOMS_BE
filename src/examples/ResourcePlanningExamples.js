/**
 * Example: Tính toán phân bổ tài nguyên
 * 
 * API: POST /api/invoices/calculate-resources
 */

const ResourcePlanningCalculator = require('../utils/ResourcePlanningCalculator');

// EXAMPLE 1: TH1 - Deadline hạn chế (11h đến 13h, cần 2 xe)
async function exampleScenario1() {
  const currentTime = new Date('2026-01-06T11:00:00');
  const deliveryDeadline = new Date('2026-01-06T13:00:00'); // 2 tiếng
  const travelTime = 60; // 1 tiếng

  const result = ResourcePlanningCalculator.calculateResourceNeeds({
    currentTime,
    deliveryDeadline,
    estimatedPickupTime: 30,
    travelTime: 60,
    estimatedDeliveryTime: 30
  });

  console.log('=== SCENARIO 1: Deadline hạn chế ===');
  console.log('Current:', currentTime.toLocaleTimeString());
  console.log('Deadline:', deliveryDeadline.toLocaleTimeString());
  console.log('Result:', result);
  console.log('---');
  
  const timeline = ResourcePlanningCalculator.createExecutionTimeline({
    currentTime,
    estimatedPickupTime: 30,
    travelTime: 60,
    estimatedDeliveryTime: 30,
    vehiclesNeeded: result.vehiclesNeeded,
    strategyUsed: result.strategyUsed
  });
  
  console.log('Timeline:', JSON.stringify(timeline, null, 2));
  console.log('\n');
}

// EXAMPLE 2: TH2 - Deadline thoáng (11h đến 15h, chỉ cần 1 xe)
async function exampleScenario2() {
  const currentTime = new Date('2026-01-06T11:00:00');
  const deliveryDeadline = new Date('2026-01-06T15:00:00'); // 4 tiếng
  const travelTime = 60; // 1 tiếng

  const result = ResourcePlanningCalculator.calculateResourceNeeds({
    currentTime,
    deliveryDeadline,
    estimatedPickupTime: 30,
    travelTime: 60,
    estimatedDeliveryTime: 30
  });

  console.log('=== SCENARIO 2: Deadline thoáng ===');
  console.log('Current:', currentTime.toLocaleTimeString());
  console.log('Deadline:', deliveryDeadline.toLocaleTimeString());
  console.log('Result:', result);
  console.log('---');
  
  const timeline = ResourcePlanningCalculator.createExecutionTimeline({
    currentTime,
    estimatedPickupTime: 30,
    travelTime: 60,
    estimatedDeliveryTime: 30,
    vehiclesNeeded: result.vehiclesNeeded,
    strategyUsed: result.strategyUsed
  });
  
  console.log('Timeline:', JSON.stringify(timeline, null, 2));
  console.log('\n');
}

// EXAMPLE 3: Tính nhân công
async function exampleStaffCalculation() {
  const staffNeeds = ResourcePlanningCalculator.calculateStaffNeeds({
    totalWeight: 800, // 800kg
    totalVolume: 5,
    vehiclesNeeded: 2,
    hasService: true
  });

  console.log('=== STAFF CALCULATION ===');
  console.log('Total weight: 800kg, 2 vehicles, with packing service');
  console.log('Result:', staffNeeds);
}

// Run examples
exampleScenario1();
exampleScenario2();
exampleStaffCalculation();

module.exports = {
  exampleScenario1,
  exampleScenario2,
  exampleStaffCalculation
};
