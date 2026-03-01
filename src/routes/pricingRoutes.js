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

module.exports = router;
