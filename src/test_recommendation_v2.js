const moment = require('moment');

class MockRecommendationService {
  constructor() {
    this.weights = { weather: 0.4, traffic: 0.3, demand: 0.3 };
  }

  getWeatherScore(rainChance, avgTemp) {
    if (rainChance > 80) return { 
        score: -100, 
        isBlocked: true, 
        blockReason: 'Mưa lớn (>80%) - Nguy cơ hỏng đồ cao',
        suggestAlternatives: true
    };
    if (rainChance > 60) return { score: -30, isBlocked: false };
    if (avgTemp > 35) return { score: -10, isBlocked: false };
    if (avgTemp >= 25 && avgTemp <= 32 && rainChance <= 10) return { score: 100, isBlocked: false };
    return { score: 0, isBlocked: false };
  }

  getTrafficScore(dateStr, distanceKm) {
    const date = moment(dateStr, 'YYYY-MM-DD HH:mm');
    const dayName = date.format('dddd');
    const hour = date.hour();
    const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';

    let baseScore = 0;
    if (dayName === 'Monday' || dayName === 'Friday') baseScore -= 20;
    if ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19)) baseScore -= 25;
    else if (isWeekend) baseScore -= 5;
    else baseScore += 30;

    const distanceFactor = Math.min(2, distanceKm / 10);
    return baseScore * distanceFactor;
  }

  getDemandScore(count) {
    if (count >= 5) return -100;
    if (count <= 2) return 100;
    return 0;
  }

  calculate(weather, traffic, demand) {
    const totalScore = (weather.score * this.weights.weather) + 
                       (traffic * this.weights.traffic) + 
                       (demand * this.weights.demand);
    
    let adjustmentPercent = totalScore * 0.3;
    if (adjustmentPercent > 15) adjustmentPercent = 15;
    
    return { 
        totalScore: Math.round(totalScore), 
        isBlocked: weather.isBlocked, 
        blockReason: weather.blockReason,
        suggestAlternatives: weather.suggestAlternatives,
        adjustmentPercent: Math.round(adjustmentPercent * 10) / 10 
    };
  }
}

const mock = new MockRecommendationService();

console.log('--- TEST 1: BEST Case (Good Weather, Normal Day, Low Demand, 20km) ---');
// Weather: 100 * 0.4 = 40
// Traffic: (30 * min(2, 20/10)) * 0.3 = 60 * 0.3 = 18
// Demand: 100 * 0.3 = 30
// Total: 40 + 18 + 30 = 88
// Adjustment: 88 * 0.3 = 26.4% -> Capped at 15%
let w1 = mock.getWeatherScore(5, 28); 
let t1 = mock.getTrafficScore('2026-03-31 10:00', 20); 
let d1 = mock.getDemandScore(1); 
let res1 = mock.calculate(w1, t1, d1);
console.log(`Total Score: ${res1.totalScore}, Adjustment: ${res1.adjustmentPercent}%`);

console.log('\n--- TEST 2: SOFT BLOCK Case (Heavy Rain) ---');
// Weather: -100 * 0.4 = -40, isBlocked: true
let w2 = mock.getWeatherScore(85, 25); 
let t2 = mock.getTrafficScore('2026-03-31 10:00', 10); 
let d2 = mock.getDemandScore(1); 
let res2 = mock.calculate(w2, t2, d2);
console.log(`Total Score: ${res2.totalScore}, isBlocked: ${res2.isBlocked}, Reason: ${res2.blockReason}, SuggestAlt: ${res2.suggestAlternatives}`);

console.log('\n--- TEST 3: Traffic Cap (50km) ---');
// Distance 50km -> Factor capped at 2 -> same as 20km
let t3 = mock.getTrafficScore('2026-03-31 10:00', 50); 
console.log(`Traffic Score (50km): ${t3} (Expected: 60)`);

console.log('\n--- TEST 4: Surcharge Case (Rainy, Rush Hour, High Demand, 5km) ---');
let w4 = mock.getWeatherScore(65, 25); // -30 * 0.4 = -12
let t4 = mock.getTrafficScore('2026-03-30 08:00', 5); // (-45 * 0.5) * 0.3 = -6.75
let d4 = mock.getDemandScore(10); // -100 * 0.3 = -30
let res4 = mock.calculate(w4, t4, d4);
console.log(`Total Score: ${res4.totalScore}, Adjustment: ${res4.adjustmentPercent}% (Surcharge)`);
