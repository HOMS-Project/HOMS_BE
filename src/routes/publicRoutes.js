const express = require('express');
const router = express.Router();
const publicPricingController = require('../controllers/publicPricingController');
const recommendationController = require('../controllers/recommendationController');

// POST /api/public/estimate-price
router.post('/estimate-price', publicPricingController.estimatePrice);

// POST /api/public/best-moving-time - AI-powered suggestion for best moving time
router.post('/best-moving-time', recommendationController.getBestMovingTime);

module.exports = router;
