const express = require('express');
const router = express.Router();
const publicPricingController = require('../controllers/publicPricingController');
const recommendationController = require('../controllers/recommendationController');
const serviceRatingController = require('../controllers/serviceRatingController');
const invoiceService = require('../services/invoiceService');

// POST /api/public/estimate-price
router.post('/estimate-price', publicPricingController.estimatePrice);

// POST /api/public/best-moving-time - AI-powered suggestion for best moving time
router.post('/best-moving-time', recommendationController.getBestMovingTime);

// GET /api/public/ratings - Lấy đánh giá tốt cho Landing Page
router.get('/ratings', serviceRatingController.getPublicRatings);

// GET /api/public/recent-orders - Lấy dữ liệu đơn hàng thành công gần đây rải rác trên Landing Page
router.get('/recent-orders', async (req, res) => {
  try {
    const data = await invoiceService.getRecentCompleted(5);
    res.json({ success: true, data });
  } catch(err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
