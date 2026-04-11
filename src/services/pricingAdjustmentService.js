const SystemConfigService = require('./systemConfigService');
const PricingData = require('../models/PricingData');
const moment = require('moment');

class PricingAdjustmentService {
  /**
   * Check if we have remaining discount budget for today
   */
  async getDailyDiscountsTotal() {
    const today = moment().startOf('day').toDate();
    const result = await PricingData.aggregate([
      { $match: { createdAt: { $gte: today }, 'dynamicAdjustment.appliedAmount': { $lt: 0 } } },
      { $group: { _id: null, total: { $sum: { $abs: '$dynamicAdjustment.appliedAmount' } } } }
    ]);
    return result[0]?.total || 0;
  }

  /**
   * Apply dynamic adjustments with enterprise-grade controls
   */
  async applyAdjustments(basePricing, recommendation, requestTicketId) {
    const { recommendedSlot, experimentGroup } = recommendation;
    const { score, isBlocked, label } = recommendedSlot;

    // Fetch Configs
    const pricingConfig = await SystemConfigService.getConfig('pricing_config');
    const budgetConfig = await SystemConfigService.getConfig('budget_config');
    
    const { minPrice, maxMultiplier, scoreMultiplier } = pricingConfig;

    // 💰 Revenue Control: Check daily budget
    const todayDiscountTotal = await this.getDailyDiscountsTotal();
    const isBudgetExhausted = todayDiscountTotal >= budgetConfig.dailyDiscountLimit;

    // Continuous pricing: adjustmentPercent = score * scoreMultiplier (capped at maxDiscount)
    let adjustmentPercent = score * scoreMultiplier;
    
    // If budget exhausted, only allow surcharges (ignore positive scores/discounts)
    if (isBudgetExhausted && adjustmentPercent > 0) {
        adjustmentPercent = 0;
    }

    if (adjustmentPercent > pricingConfig.maxDiscount) {
        adjustmentPercent = pricingConfig.maxDiscount;
    }
    
    const finalAdjustmentPercent = Math.round(adjustmentPercent * 10) / 10;

    const { totalPrice: basePrice } = basePricing;
    let finalPrice = basePrice;
    let appliedAmount = 0;

    if (finalAdjustmentPercent !== 0) {
      // Feature Toggle: AI no longer affects calculation, only provides date advisory.
      appliedAmount = 0;
    }

    // 🛡️ Apply Guardrails (Clamp)
    const originalPrice = finalPrice; // Keep for guardrailTriggered check
    const maxAllowedPrice = basePrice * maxMultiplier;
    if (finalPrice < minPrice) finalPrice = minPrice;
    if (finalPrice > maxAllowedPrice) finalPrice = maxAllowedPrice;

    // 🔐 Edge Protection: Check for Price Jumping on Re-quotes
    let manualApprovalRequired = false;
    if (requestTicketId) {
        const lastQuote = await PricingData.findOne({ requestTicket: requestTicketId }).sort({ createdAt: -1 });
        if (lastQuote) {
            const priceChange = Math.abs(finalPrice - lastQuote.totalPrice) / lastQuote.totalPrice;
            if (priceChange > 0.20) { // > 20% jump
                manualApprovalRequired = true;
            }
        }
    }

    // Round to thousands
    finalPrice = Math.round(finalPrice / 1000) * 1000;

    // Build human-readable explanation from reasons
    const reasonList = recommendedSlot.reasons || [];
    if (isBudgetExhausted && score > 0) reasonList.push("Ngân sách khuyến mãi trong ngày đã hết");
    if (manualApprovalRequired) reasonList.push("Giá biến động mạnh - Cần phê duyệt");

    const dynamicAdjustment = {
      label,
      score,
      isBlocked,
      adjustmentPercent: finalAdjustmentPercent,
      appliedAmount,
      reason: reasonList.join(", "),
      strategy: "EXCELLENT_TIER_V3",
      guardrailTriggered: originalPrice !== finalPrice,
      budgetExhausted: isBudgetExhausted,
      manualApprovalRequired,
      experimentGroup,
      
      recommendationSnapshot: {
        factors: recommendation.recommendedSlot.factors,
        alternatives: recommendation.alternatives,
        timestamp: new Date()
      }
    };

    console.info(`[ExcellentPricing] Request: ${requestTicketId} | Base: ${basePrice} -> Final: ${finalPrice} | Group: ${experimentGroup} | BudgetUsed: ${todayDiscountTotal}`);

    return {
      ...basePricing,
      totalPrice: finalPrice,
      dynamicAdjustment,
      recommendationResult: recommendation 
    };
  }
}

module.exports = new PricingAdjustmentService();
