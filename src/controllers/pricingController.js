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
