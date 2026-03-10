const express = require('express');
const router = express.Router();
const publicPricingController = require('../controllers/publicPricingController');

// POST /api/public/estimate-price
router.post('/estimate-price', publicPricingController.estimatePrice);

module.exports = router;
