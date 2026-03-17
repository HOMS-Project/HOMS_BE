const express = require('express');
const router = express.Router();

const { authenticate }    = require('../middlewares/authMiddleware');
const { validateRating } = require('../middlewares/ratingMiddleware');
const {
  createRating,
  getRatingByInvoice,
  getRatingsByDriver,
} = require('../controllers/serviceRatingController');

/**
 * @route   POST /api/service-ratings
 * @desc    Khách hàng gửi đánh giá cho đơn hoàn thành
 * @access  Private (customer)
 */
router.post('/', authenticate, validateRating, createRating);

/**
 * @route   GET /api/service-ratings/invoice/:invoiceId
 * @desc    Lấy đánh giá theo invoiceId
 * @access  Private
 */
router.get('/invoice/:invoiceId', authenticate, getRatingByInvoice);

/**
 * @route   GET /api/service-ratings/driver/:driverId
 * @desc    Lấy tất cả đánh giá của một tài xế
 * @access  Private
 */
router.get('/driver/:driverId', authenticate, getRatingsByDriver);

module.exports = router;