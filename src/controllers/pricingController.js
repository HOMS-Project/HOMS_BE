/**
 * PricingController - API handlers cho Pricing Data
 */

const PricingCalculationService = require('../services/pricingCalculationService');
const AppError = require('../utils/appErrors');

/**
 * POST /api/pricing/:requestTicketId/approve
 * Phê duyệt giá - Cập nhật RequestTicket status sang QUOTED
 */
exports.approvePricing = async (req, res, next) => {
  try {
    const { requestTicketId } = req.params;
    const { pricingDataId } = req.body;

    if (!pricingDataId) {
      throw new AppError('pricingDataId là bắt buộc', 400);
    }

    const result = await PricingCalculationService.approvePricing(
      requestTicketId,
      pricingDataId
    );

    res.json({
      success: true,
      message: 'Pricing approved successfully',
      data: {
        pricingData: result.pricingData,
        ticket: result.ticket
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/pricing/:requestTicketId
 * Lấy chi tiết báo giá
 */
exports.getPricingByTicket = async (req, res, next) => {
  try {
    const { requestTicketId } = req.params;
    const PricingData = require('../models/PricingData');
    
    // Tìm báo giá mới nhất của ticket này
    const pricingData = await PricingData.findOne({ requestTicketId }).sort({ createdAt: -1 });
    
    if (!pricingData) {
      return res.status(404).json({ success: false, message: 'Chưa có báo giá chi tiết cho đơn này.' });
    }

    res.json({
      success: true,
      data: pricingData
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/pricing/calculate
 * Tính giá tạm thời cho một yêu cầu (không lưu vào DB)
 * Body: surveyData-like object. For truck rental we expect fields like:
 *  - rentalDetails: { truckType, rentalDurationHours, withDriver }
 *  - movingDate, distanceKm, suggestedStaffCount
 */
exports.calculatePricing = async (req, res, next) => {
  try {
    const body = req.body || {};

    // Map incoming payload to the surveyData shape expected by service
    // Accept either rentalDetails or flattened suggestedVehicle/rentalDurationHours
    const rental = body.rentalDetails || {};
    const surveyData = {
      suggestedVehicle: rental.truckType || body.suggestedVehicle || null,
      rentalDurationHours: rental.rentalDurationHours || body.rentalDurationHours || null,
      withDriver: rental.withDriver !== undefined ? rental.withDriver : body.withDriver,
      suggestedStaffCount: body.suggestedStaffCount || 1,
      distanceKm: body.distanceKm || 0,
      estimatedHours: body.estimatedHours || null,
      scheduledTime: body.movingDate || body.scheduledTime || null
    };

    const priceList = await require('../services/pricingCalculationService').getActivePriceList();
    const result = await require('../services/pricingCalculationService').calculatePricing(surveyData, priceList, 'TRUCK_RENTAL');

    return res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
