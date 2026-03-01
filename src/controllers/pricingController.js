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
