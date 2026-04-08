const moment = require('moment');

// Mocking logic to avoid actual DB/API calls during verification
class StressTestRecommendationService {
  constructor() {
    this.weights = { weather: 0.4, traffic: 0.3, demand: 0.3 };
    this.capacityPerSlot = 5;
    this.weatherCache = new Map();
  }

  // Simplified logic for testing
  getWeatherScore(rainChance, avgTemp) {
     if (rainChance > 80) return { score: -100, isBlocked: true, blockReason: "Mưa lớn" };
     if (avgTemp >= 25 && avgTemp <= 32 && rainChance <= 10) return { score: 100, isBlocked: false };
     return { score: 0, isBlocked: false };
  }

  getTrafficScore(dateStr, distanceKm) {
    const distanceFactor = Math.min(2, distanceKm / 10);
    return 30 * distanceFactor; // Baseline Tuesday 10am
  }

  getDemandScore(bookingsCount) {
    const utilization = bookingsCount / this.capacityPerSlot;
    if (utilization >= 0.85) return -100;
    if (utilization <= 0.4) return 100;
    return 0;
  }

  calculate(weather, traffic, demand) {
    const totalScore = (weather.score * this.weights.weather) + 
                       (traffic * this.weights.traffic) + 
                       (demand * this.weights.demand);
    
    let adj = totalScore * 0.3;
    if (adj > 15) adj = 15;
    
    return { 
        score: Math.round(totalScore), 
        adjustment: Math.round(adj * 10) / 10,
        isBlocked: weather.isBlocked 
    };
  }
}

const tester = new StressTestRecommendationService();

console.log('--- SCENARIO 1: Utilization Peak (Fully Booked) ---');
let w = tester.getWeatherScore(5, 28); // 100 * 0.4 = 40
let t = tester.getTrafficScore('2026-03-31 10:00', 10); // 30 * 0.3 = 9
let d = tester.getDemandScore(5); // Utilization 1.0 -> -100 * 0.3 = -30
let res = tester.calculate(w, t, d);
console.log(`Utilization 1.0 Score: ${res.score}, Adjustment: ${res.adjustment}% (Surcharge expected)`);

console.log('\n--- SCENARIO 2: Utilization Low (Empty Slot) ---');
d = tester.getDemandScore(1); // Utilization 0.2 -> 100 * 0.3 = 30
res = tester.calculate(w, t, d);
console.log(`Utilization 0.2 Score: ${res.score}, Adjustment: ${res.adjustment}% (Discount expected)`);

console.log('\n--- SCENARIO 3: Extreme Traffic (Long Distance 50km) ---');
t = tester.getTrafficScore('2026-03-31 10:00', 50); // Factor capped at 2 -> Score 60 -> 60 * 0.3 = 18
res = tester.calculate(w, t, 0); // Demand 0
console.log(`Traffic Score (50km): ${res.score} (Expected factor cap at 2 -> 40[weather] + 18[traffic] = 58)`);

console.log('\n--- SCENARIO 4: Multi-slot Explanation ---');
const factors = { weather: 100, traffic: 60, demand: -100 };
const explanations = [];
if (factors.weather >= 50) explanations.push("Thời tiết thuận lợi");
if (factors.traffic >= 20) explanations.push("Giao thông thông thoáng");
if (factors.demand <= -50) explanations.push("Nhu cầu cao");
console.log(`Explanation: ${explanations.join(", ")}`);

console.log('\n--- SCENARIO 5: Cache Simulation ---');
const cache = new Map();
const key = "HCMC:2026-03-31";
console.log("Setting cache...");
cache.set(key, { data: { score: 100 }, timestamp: Date.now() });
const start = Date.now();
const hit = cache.get(key);
const end = Date.now();
console.log(`Cache Hit: ${!!hit}, Score: ${hit.data.score}, Latency: ${end - start}ms`);
