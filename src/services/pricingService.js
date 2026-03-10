/**
 * PricingService (legacy wrapper)
 *
 * The primary pricing engine is PricingCalculationService.
 * This class proxies the calculatePrice endpoint flow so that the
 * invoiceController can remain thin. All real logic lives in
 * pricingCalculationService.js.
 *
 * Formula (handled by PricingCalculationService):
 *   TOTAL = BaseTransportFee + VehicleFee + LaborFee + ServiceFee
 *         + DistanceSurcharge + DifficultySurcharge
 *         + InsuranceFee + ManagementFee
 *         - PromotionDiscount  ← BEFORE TAX
 *         + Tax
 */

const PricingData = require('../models/PricingData');
const PriceList = require('../models/PriceList');
const SurveyData = require('../models/SurveyData');
const Promotion = require('../models/Promotion');
const PricingCalculationService = require('./pricingCalculationService');
const AppError = require('../utils/appErrors');

class PricingService {

  /**
   * Main entry point called by invoiceController.calculatePrice.
   *
   * @param {string} requestTicketId
   * @param {object} input
   * @param {string} input.surveyDataId   - ObjectId of completed SurveyData
   * @param {string} input.priceListId    - ObjectId of PriceList to use (optional, falls back to active)
   * @param {string} [input.promotionId]  - ObjectId of Promotion (optional)
   * @param {string} input.calculatedBy  - UserId (staff who is creating the quote)
   */
  async calculatePrice(requestTicketId, input) {
    const { surveyDataId, priceListId, promotionId, calculatedBy } = input;

    // 1. Load SurveyData
    const surveyData = await SurveyData.findById(surveyDataId);
    if (!surveyData) {
      throw new AppError('SurveyData không tồn tại', 404);
    }
    if (surveyData.status !== 'COMPLETED') {
      throw new AppError('Khảo sát chưa hoàn tất, không thể tính giá', 400);
    }

    // 2. Load PriceList
    let priceList;
    if (priceListId) {
      priceList = await PriceList.findById(priceListId);
      if (!priceList) throw new AppError('PriceList không tồn tại', 404);
    } else {
      priceList = await PricingCalculationService.getActivePriceList();
    }

    // 3. Resolve promotion discount
    const promotionOptions = {};
    if (promotionId) {
      const promotion = await Promotion.findById(promotionId);
      if (promotion && this._isPromotionValid(promotion)) {
        if (promotion.discountPercent) {
          promotionOptions.discountPercent = promotion.discountPercent;
        } else if (promotion.discountAmount) {
          promotionOptions.discountAmount = promotion.discountAmount;
        }
      }
    }

    // 4. Calculate (no DB write)
    const pricingResult = await PricingCalculationService.calculatePricing(
      surveyData,
      priceList,
      promotionOptions
    );

    // 5. Persist as new version
    const pricingData = await PricingCalculationService.createPricingData(
      requestTicketId,
      surveyData,
      pricingResult,
      priceList,
      calculatedBy
    );

    return pricingData;
  }

  /**
   * Convenience: recalculate after a completed survey (called from surveyService).
   * Uses active PriceList automatically.
   */
  async recalculateFromSurvey(requestTicketId, surveyData, userId) {
    const priceList = await PricingCalculationService.getActivePriceList();
    const pricingResult = await PricingCalculationService.calculatePricing(surveyData, priceList);
    return PricingCalculationService.createPricingData(
      requestTicketId,
      surveyData,
      pricingResult,
      priceList,
      userId
    );
  }

  /**
   * Lấy pricing data mới nhất cho một request ticket
   */
  async getLatestPricingByTicket(requestTicketId) {
    return PricingData.findOne({ requestTicketId })
      .sort({ version: -1 })
      .populate('priceListId')
      .populate('surveyDataId');
  }

  /**
   * Check if a promotion is still valid
   */
  _isPromotionValid(promotion) {
    const now = new Date();
    return (
      promotion.isActive &&
      (!promotion.startDate || promotion.startDate <= now) &&
      (!promotion.endDate || promotion.endDate >= now)
    );
  }
}

module.exports = new PricingService();
