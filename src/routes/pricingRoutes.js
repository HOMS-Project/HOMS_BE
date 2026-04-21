/**
 * Routes cho Pricing Data
 */

const express = require('express');
const router = express.Router();
const pricingController = require('../controllers/pricingController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * PRICING DATA ENDPOINTS
 */

// POST /api/pricing/:requestTicketId/approve - Phê duyệt giá
router.post(
  '/:requestTicketId/approve',
  authenticate,
  pricingController.approvePricing
);

// GET /api/pricing/:requestTicketId - Tìm báo giá của ticket
router.get(
  '/:requestTicketId',
  authenticate,
  pricingController.getPricingByTicket
);

// POST /api/pricing/calculate - Tính báo giá tạm thời (public)
router.post('/calculate', pricingController.calculatePricing);

module.exports = router;
