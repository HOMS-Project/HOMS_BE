const SystemConfigService = require('./systemConfigService');
const moment = require('moment');
const axios = require('axios');
const RequestTicket = require('../models/RequestTicket');

class RecommendationService {
  constructor() {
    this.apiKey = process.env.WEATHER_API_KEY;
    this.tomtomApiKey = process.env.TOMTOM_API_KEY;
    this.weatherCache = new Map();
    this.trafficCache = new Map();
    this.CACHE_TTL = 3600 * 1000;
    this.TRAFFIC_CACHE_TTL = 15 * 60 * 1000; // 15 mins for real-time traffic

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

  // Weather score based on simple heuristics (can be upgraded to real API)
  async getWeatherScore(date, location) {
    const timeKey = moment(date).format('YYYY-MM-DD_HH');
    const locKey = typeof location === 'object' ? `${location.lat},${location.lng}` : location;
    const cacheKey = `${locKey}_${timeKey}`;

    if (this.weatherCache.has(cacheKey)) {
      const cached = this.weatherCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
    }

    // MVP Simulated Weather (until real API integration)
    // Factoring in hot/cold temperatures and seasonal rains based on Vietnamese climate
    const hour = moment(date).hour();
    const month = moment(date).month() + 1; // 1-12

    let score = 0;
    let isBlocked = false;
    let blockReason = null;
    let weatherReason = null;

    const isHotSeason = month >= 4 && month <= 8;
    const isRainySeason = month >= 9 && month <= 12;

    if (hour >= 11 && hour <= 14) {
      // Extreme midday heat constraint
      score = isHotSeason ? -60 : -30;
      weatherReason = isHotSeason
        ? 'Nắng nóng gay gắt giữa trưa, gây mệt mỏi và rủi ro cho hàng hóa quá nhiệt'
        : 'Trưa chiều khá nóng, có thể làm giảm tiến độ vận chuyển';
    } else if (hour >= 6 && hour <= 9) {
      // Cool morning (Bonus)
      score = 30;
      weatherReason = 'Thời tiết sáng sớm mát mẻ, đặc biệt lý tưởng để chuyển đồ';
    } else if (hour >= 15 && hour <= 18 && isRainySeason) {
      // High likelihood of afternoon downpours in rainy season
      score = -50;
      weatherReason = 'Rủi ro cao có mưa rào chiều tối mùa mưa, dễ gây ướt/hư hỏng đồ đạc';
    } else if (hour >= 19) {
      score = 10;
      weatherReason = 'Nhiệt độ dịu mát vào ban đêm';
    }

    const weatherData = {
      score,
      isBlocked,
      blockReason,
      weatherReason,
      suggestAlternatives: score < -30
    };

    this.weatherCache.set(cacheKey, { timestamp: Date.now(), data: weatherData });

    return weatherData;
  }

  // Traffic score based on real-time TomTom API (if applicable) or time-of-day/weekday heuristics
  async getTrafficScore(date, distanceKm = 0, location = null) {
    const d = moment(date);
    const dayName = d.format('dddd');
    const hour = d.hour();
    const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';

    let baseScore = 0;

    if (dayName === 'Monday') baseScore -= 30; // Monday is generally extremely busy
    else if (dayName === 'Friday') baseScore -= 20;

    // Rush hours on weekdays are terrible for moving locally
    if (!isWeekend && ((hour >= 7 && hour < 9) || (hour >= 17 && hour < 19))) {
      baseScore -= 60; // Massive peak traffic penalty
    } else if (isWeekend) {
      baseScore -= 10; // Weekend traffic is generally mixed, no extreme peaks
    } else {
      baseScore += 30; // Weekday off-peak is great
    }

    // Distance multiplier: longer distance in bad traffic = exponentially worse score. Min multiplier is 1.
    const distanceFactor = Math.max(1, Math.min(3, (Number(distanceKm) || 1) / 8));
    let finalScore = baseScore * distanceFactor;

    // Real-Time TomTom Traffic Integration
    // Only check live traffic if the scheduled date is within the next 2 hours
    if (this.tomtomApiKey && location && typeof location === 'object' && location.lat && location.lng) {
      if (Math.abs(d.diff(moment(), 'hours')) <= 2) {
        const cacheKey = `${location.lat},${location.lng}`;
        if (this.trafficCache.has(cacheKey)) {
          const cached = this.trafficCache.get(cacheKey);
          if (Date.now() - cached.timestamp < this.TRAFFIC_CACHE_TTL) {
            return cached.data;
          }
        }

        try {
          const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${this.tomtomApiKey}&point=${location.lat},${location.lng}&unit=KMPH`;
          const response = await axios.get(url, { timeout: 3000 }); // Fast fail

          if (response.data && response.data.flowSegmentData) {
            const flow = response.data.flowSegmentData;
            const ratio = flow.freeFlowSpeed > 0 ? (flow.currentSpeed / flow.freeFlowSpeed) : 1;

            let liveScore = 0;
            if (ratio >= 0.85) liveScore = 40;        // Open roads
            else if (ratio >= 0.65) liveScore = 0;    // Moderate traffic
            else if (ratio >= 0.4) liveScore = -40;   // Heavy traffic
            else liveScore = -90;                     // Standstill

            finalScore = liveScore * distanceFactor;
            this.trafficCache.set(cacheKey, { timestamp: Date.now(), data: finalScore });
          }
        } catch (error) {
          console.error('TomTom API fetch failed, falling back to heuristic:', error.message);
        }
      }
    }

    return finalScore;
  }

  async getDemandScore(date) {
    try {
      const hour = moment(date).hour();
      let slotRange = { start: 7, end: 11 };

      if (hour < 7) slotRange = { start: 0, end: 7 };
      else if (hour >= 11 && hour < 15) slotRange = { start: 11, end: 15 };
      else if (hour >= 15 && hour < 19) slotRange = { start: 15, end: 19 };
      else if (hour >= 19) slotRange = { start: 19, end: 24 };

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

  normalizeScore(score, min = -100, max = 100) {
    return Math.max(min, Math.min(max, score));
  }

  async calculateRecommendation(date, location, distanceKm, experimentGroup = 'CONTROL', moveType = 'FULL_HOUSE', rentalDetails = null) {
    const weatherData = await this.getWeatherScore(date, location);
    const trafficScore = await this.getTrafficScore(date, distanceKm, location);
    let demandScore = await this.getDemandScore(date);
    const businessBoost = await this.getBusinessIntentBoost(date);

    // TRUCK_RENTAL Availability logic
    let availabilityScore = 0;
    let isAvailabilityBlocked = false;
    let availabilityBlockReason = null;

    if (moveType === 'TRUCK_RENTAL') {
      try {
        const truckType = rentalDetails?.truckType || '1TON'; // fallback
        const rentalHrs = rentalDetails?.rentalDurationHours || 1;
        const startTime = moment(date).toDate();
        const endTime = moment(date).add(rentalHrs, 'hours').toDate();

        // 1. Get Fleet Size (mocked/static for now per phase 1.3 deferred)
        // Use generic capacity as fleet size or explicit map
        const fleetMap = { '500KG': 5, '1TON': 5, '1.5TON': 3, '2TON': 2 };
        const totalFleet = fleetMap[truckType] || 5;

        // 2. Count overlapping active bookings
        const RequestTicket = require('../models/RequestTicket');
        const overlappingBookings = await RequestTicket.countDocuments({
          'rentalDetails.truckType': truckType,
          status: { $in: ['ACCEPTED', 'CONVERTED', 'IN_PROGRESS'] }, // Adjust based on your valid active statuses
          scheduledTime: { $lt: endTime },
          endTime: { $gt: startTime } // The new field
        });

        const availableTrucks = totalFleet - overlappingBookings;

        if (availableTrucks <= 0) {
          availabilityScore = -100;
          isAvailabilityBlocked = true;
          availabilityBlockReason = 'Hết xe trong khung giờ này';
        } else {
          availabilityScore = 50 + (availableTrucks * 10); // positive score for having trucks
          if (availabilityScore > 100) availabilityScore = 100;
        }
      } catch (err) {
        console.error('Lỗi tính availabilityScore:', err);
      }
    }

    // Normalize factor scores to ensure consistent scaling (-100 to 100)
    const normWeather = this.normalizeScore(weatherData.score);
    const normTraffic = this.normalizeScore(trafficScore);
    const normDemand = this.normalizeScore(demandScore);
    const normAvailability = this.normalizeScore(availabilityScore);

    // 🔬 A/B Testing & Flow type Weights
    let currentWeights = this.weights;
    if (moveType === 'TRUCK_RENTAL') {
      currentWeights = { weather: 0.1, traffic: 0.2, demand: 0.4, availability: 0.3 };
    } else if (experimentGroup === 'GROUP_B') {
      currentWeights = { weather: 0.2, traffic: 0.6, demand: 0.2 };
    }

    let rawScore = 0;
    if (moveType === 'TRUCK_RENTAL') {
      rawScore = (normWeather * currentWeights.weather) +
        (normTraffic * currentWeights.traffic) +
        (normDemand * currentWeights.demand) +
        (normAvailability * currentWeights.availability);
    } else {
      rawScore = (normWeather * currentWeights.weather) +
        (normTraffic * currentWeights.traffic) +
        (normDemand * currentWeights.demand);
    }

    let penalty = 0;
    const reasons = [];

    // 🚨 Dominant Factor Hard Penalty Layer
    let worstFactor = Math.min(normWeather, normTraffic, normDemand);
    if (moveType === 'TRUCK_RENTAL') {
      worstFactor = Math.min(normWeather, normTraffic, normDemand, normAvailability);
    }

    // Penalties adjusted for TRUCK_RENTAL
    const isMorningRush = moment(date).format('dddd') !== 'Saturday' && moment(date).format('dddd') !== 'Sunday' && moment(date).hour() >= 7 && moment(date).hour() < 9;

    if (moveType === 'TRUCK_RENTAL') {
      if (isMorningRush) {
        penalty -= 10; // Softer penalty
        reasons.push('Đường phố có thể đông đúc giờ cao điểm');
      } else if (worstFactor <= -80) {
        penalty -= 20;
        reasons.push('Thời gian thuê chưa tối ưu do nhu cầu cao hoặc kẹt xe');
      }
    } else {
      if (isMorningRush) {
        penalty -= 50;
        reasons.push('Nguy cơ kẹt xe rủi ro cực cao vào giờ cao điểm các ngày trong tuần');
      } else if (worstFactor <= -80) {
        penalty -= 40;
        reasons.push('Thời gian không khuyến nghị do điều kiện vô cùng bất lợi (kẹt xe/thời tiết/kín lịch)');
      } else if (worstFactor <= -50) {
        penalty -= 20;
      }
    }

    const totalScore = rawScore + businessBoost + penalty;

    let label = 'NORMAL';
    if (moveType === 'TRUCK_RENTAL') {
      // Adjusted labeling for TRUCK_RENTAL
      if (isAvailabilityBlocked) label = 'BAD';
      else if (totalScore > 30) label = 'BEST';
      else if (totalScore > 10) label = 'GOOD';
      else if (totalScore < -20) label = 'BAD'; // lower threshold for BAD since traffic matters less
    } else {
      if (weatherData.isBlocked) label = 'BAD';
      else if (totalScore > 30) label = 'BEST';
      else if (totalScore > 10) label = 'GOOD';
      else if (totalScore < -10) label = 'BAD';
    }

    if (moveType === 'TRUCK_RENTAL') {
      if (normAvailability > 10) reasons.push('Còn nhiều xe trống');
      if (normDemand > 10) reasons.push('Giá thuê tốt (ít nhu cầu cạnh tranh)');
      if (normDemand < -50) reasons.push('Nhu cầu thuê xe cao, có thể giá tăng nhẹ');
    } else {
      if (weatherData.weatherReason && penalty === 0) {
        reasons.push(weatherData.weatherReason);
      } else {
        if (normWeather > 10) reasons.push('Thời tiết thuận lợi');
        else if (normWeather < -10 && worstFactor > -80) reasons.push('Thời tiết có thể bất lợi do nóng/lạnh hoặc mưa dầm');
      }

      if (normTraffic > 10) reasons.push('Đường thông thoáng, ít kẹt xe');
      else if (normTraffic < -10 && worstFactor > -80 && penalty === 0) reasons.push('Có thể kẹt xe trên tuyến đường');

      if (normDemand > 50) reasons.push('Biểu phí vận chuyển tối ưu thời điểm này');
      else if (normDemand < -50 && worstFactor > -80) reasons.push('Giờ cao điểm dịch vụ, lịch xe khá kẹt');
    }

    let finalIsBlocked = false;
    let finalBlockReason = null;

    if (moveType === 'TRUCK_RENTAL') {
      finalIsBlocked = isAvailabilityBlocked; // DON'T block on weather/traffic
      finalBlockReason = availabilityBlockReason;
    } else {
      finalIsBlocked = weatherData.isBlocked || false;
      finalBlockReason = weatherData.blockReason || null;
    }

    return {
      date: moment(date).format('YYYY-MM-DD'),
      time: moment(date).format('HH:mm'),
      score: Math.round(totalScore),
      factors: {
        weather: Math.round(normWeather),
        traffic: Math.round(normTraffic),
        demand: Math.round(normDemand),
        availability: moveType === 'TRUCK_RENTAL' ? Math.round(normAvailability) : undefined,
        businessBoost,
        weights: currentWeights
      },
      label,
      isBlocked: finalIsBlocked,
      blockReason: finalBlockReason,
      suggestAlternatives: moveType === 'TRUCK_RENTAL' ? finalIsBlocked : (weatherData.suggestAlternatives || false),
      reasons
    };
  }

  async getRecommendations(scheduledDate, location, distanceKm = 10, moveType = 'FULL_HOUSE', rentalDetails = null) {
    // 🧬 Assign Experiment Group (50/50 split)
    const experimentGroup = Math.random() > 0.5 ? 'GROUP_B' : 'CONTROL';

    const primary = await this.calculateRecommendation(scheduledDate, location, distanceKm, experimentGroup, moveType, rentalDetails);

    // Suggest alternatives (must be at least 2 days from now to match Frontend minimum booking constraint)
    const minDateConstraint = moment().add(2, 'days').startOf('day');
    const timeSlots = [9, 14, 19];
    const alternativePromises = [];

    for (let day = 0; day <= 2; day++) {
      for (let slotHour of timeSlots) {
        const testDate = moment(scheduledDate).add(day, 'days').set({ hour: slotHour, minute: 0 }).toDate();

        // Cannot be the same hour and must be in the future based on constraints
        if (moment(testDate).isSame(scheduledDate, 'hour') || moment(testDate).isBefore(minDateConstraint)) continue;

        alternativePromises.push(
          this.calculateRecommendation(testDate, location, distanceKm, experimentGroup, moveType, rentalDetails)
            .then(alt => alt)
        );
      }
    }

    const results = await Promise.all(alternativePromises);

    let alternatives = results.filter(alt => !alt.isBlocked && alt.score > 10)
      .map(alt => ({
        date: alt.date,
        time: alt.time,
        score: alt.score,
        label: alt.label
      }));

    alternatives.sort((a, b) => b.score - a.score);
    alternatives = alternatives.slice(0, 3);

    return {
      recommendedSlot: primary,
      alternatives,
      experimentGroup
    };
  }
}

module.exports = new RecommendationService();
