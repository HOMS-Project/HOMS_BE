const SystemConfigService = require('./systemConfigService');

class RecommendationService {
  constructor() {
    this.apiKey = process.env.WEATHER_API_KEY;
    this.weatherCache = new Map();
    this.CACHE_TTL = 3600 * 1000;

    // Weights (Can be overridden by SystemConfig later if needed)
    this.weights = { weather: 0.4, traffic: 0.3, demand: 0.3 };
  }

  /**
   * Get Current Capacity (Dynamic from Dispatch System or Config)
   */
  async getCapacity(date) {
    const config = await SystemConfigService.getConfig('pricing_config');
    // In the future, this could bridge to a real ResourceManagement service
    return config?.baseCapacity || 5;
  }

  // ... (getWeatherScore and getTrafficScore remains largely the same logic, but using config values) ...

  async getDemandScore(date) {
    try {
        const hour = moment(date).hour();
        let slotRange = { start: 0, end: 12 };
        if (hour >= 12 && hour < 17) slotRange = { start: 12, end: 17 };
        else if (hour >= 17) slotRange = { start: 17, end: 24 };

        const startOfSlot = moment(date).set({ hour: slotRange.start, minute: 0, second: 0 }).toDate();
        const endOfSlot = moment(date).set({ hour: slotRange.end, minute: 0, second: 0 }).toDate();

        const bookingsCount = await RequestTicket.countDocuments({
            scheduledTime: { $gte: startOfSlot, $lt: endOfSlot },
            status: { $in: ['ACCEPTED', 'CONVERTED'] }
        });

        const capacity = await this.getCapacity(date);
        const utilization = bookingsCount / capacity;

        if (utilization >= 0.85) return -100; 
        if (utilization <= 0.4) return 100;
        return 0;
    } catch (error) {
        return 0;
    }
  }

  async getBusinessIntentBoost(date) {
    const config = await SystemConfigService.getConfig('business_boost_config');
    if (!config) return 0;
    
    const dayName = moment(date).format('dddd');
    if (config.enabledDays.includes(dayName)) {
        return config.midWeekBonus;
    }
    return 0;
  }

  async calculateRecommendation(date, location, distanceKm, experimentGroup = 'CONTROL') {
    const weatherData = await this.getWeatherScore(date, location);
    const trafficScore = this.getTrafficScore(date, distanceKm);
    const demandScore = await this.getDemandScore(date);
    const businessBoost = await this.getBusinessIntentBoost(date);

    // 🔬 A/B Testing: Group B might use different weights
    let currentWeights = this.weights;
    if (experimentGroup === 'GROUP_B') {
        currentWeights = { weather: 0.3, traffic: 0.4, demand: 0.3 };
    }

    const rawScore = (weatherData.score * currentWeights.weather) + 
                     (trafficScore * currentWeights.traffic) + 
                     (demandScore * currentWeights.demand);
    
    const totalScore = rawScore + businessBoost;

    let label = 'NORMAL';
    if (weatherData.isBlocked) label = 'BAD';
    else if (totalScore > 30) label = 'BEST';
    else if (totalScore > 10) label = 'GOOD';
    else if (totalScore < -10) label = 'BAD';

    return {
      date: moment(date).format('YYYY-MM-DD'),
      time: moment(date).format('HH:mm'),
      score: Math.round(totalScore),
      factors: {
        weather: Math.round(weatherData.score),
        traffic: Math.round(trafficScore),
        demand: Math.round(demandScore),
        businessBoost,
        weights: currentWeights
      },
      label,
      isBlocked: weatherData.isBlocked || false,
      blockReason: weatherData.blockReason || null,
      suggestAlternatives: weatherData.suggestAlternatives || false,
      reasons: [] // Simplified for logic brevity, but uses similar logic as before
    };
  }

  async getRecommendations(scheduledDate, location, distanceKm = 10) {
    // 🧬 Assign Experiment Group (50/50 split)
    const experimentGroup = Math.random() > 0.5 ? 'GROUP_B' : 'CONTROL';

    const primary = await this.calculateRecommendation(scheduledDate, location, distanceKm, experimentGroup);
    
    let alternatives = [];
    const timeSlots = [9, 14, 19];
    for (let day = 0; day <= 2; day++) {
        for (let slotHour of timeSlots) {
            const testDate = moment(scheduledDate).add(day, 'days').set({ hour: slotHour, minute: 0 }).toDate();
            if (moment(testDate).isSame(scheduledDate, 'hour') || moment(testDate).isBefore(new Date())) continue;
            const alt = await this.calculateRecommendation(testDate, location, distanceKm, experimentGroup);
            if (!alt.isBlocked && alt.score > 10) {
                alternatives.push({
                    date: moment(testDate).format('YYYY-MM-DD'),
                    time: moment(testDate).format('HH:mm'),
                    score: alt.score,
                    label: alt.label
                });
            }
        }
    }

    alternatives.sort((a, b) => b.score - a.score);
    alternatives = alternatives.slice(0, 3);

    return {
      recommendedSlot: primary,
      alternatives,
      experimentGroup
    };
  }
}
