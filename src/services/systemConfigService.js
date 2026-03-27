const SystemConfig = require('../models/SystemConfig');

class SystemConfigService {
  constructor() {
    this.cache = new Map();
    this.TTL = 300000; // 5 minutes
    this.defaultConfig = {
      'pricing_config': {
        maxDiscount: 15,
        scoreMultiplier: 0.3,
        minPrice: 300000,
        maxMultiplier: 2.0
      },
      'business_boost_config': {
        midWeekBonus: 20,
        enabledDays: ['Tuesday', 'Wednesday']
      },
      'budget_config': {
        dailyDiscountLimit: 5000000 // 5 million VND daily discount budget
      }
    };
  }

  async getConfig(key) {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp < this.TTL)) {
      return cached.value;
    }

    try {
      const dbConfig = await SystemConfig.findOne({ key });
      const value = dbConfig ? dbConfig.value : this.defaultConfig[key];
      
      this.cache.set(key, { value, timestamp: Date.now() });
      return value;
    } catch (error) {
      console.error(`[SystemConfigService] Error fetching ${key}:`, error.message);
      return this.defaultConfig[key];
    }
  }

  /**
   * Initialize defaults if not exists
   */
  async initDefaults() {
    for (const [key, value] of Object.entries(this.defaultConfig)) {
      const exists = await SystemConfig.findOne({ key });
      if (!exists) {
        await SystemConfig.create({ key, value, description: `Default system config for ${key}` });
      }
    }
  }
}

module.exports = new SystemConfigService();
