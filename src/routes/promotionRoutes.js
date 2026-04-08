const express = require('express');
const router = express.Router();
const { applyPromotion, getAvailablePromotions } = require('../controllers/promotionController');
const { verifyToken } = require('../middlewares/authMiddleware');

// POST (protected) /api/promotions/apply
router.post('/apply', verifyToken, applyPromotion);

// GET (public) /api/promotions/available
// This endpoint returns active promotions applicable to a ticket and is safe to be public
router.get('/available', getAvailablePromotions);

module.exports = router;
