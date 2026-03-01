/**
 * Routes cho Price List
 */

const express = require('express');
const router = express.Router();
const priceListController = require('../controllers/priceListController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * PRICE LIST ENDPOINTS
 */

// GET /api/price-lists - Danh sách bảng giá
router.get(
  '/',
  authenticate,
  priceListController.listPriceLists
);

// GET /api/price-lists/active - Lấy bảng giá đang hoạt động
router.get(
  '/active',
  authenticate,
  priceListController.getActivePriceList
);

// POST /api/price-lists - Tạo bảng giá mới
router.post(
  '/',
  authenticate,
  priceListController.createPriceList
);

// GET /api/price-lists/:id - Lấy chi tiết bảng giá
router.get(
  '/:id',
  authenticate,
  priceListController.getPriceList
);

// PUT /api/price-lists/:id - Cập nhật bảng giá
router.put(
  '/:id',
  authenticate,
  priceListController.updatePriceList
);

// DELETE /api/price-lists/:id - Xóa bảng giá
router.delete(
  '/:id',
  authenticate,
  priceListController.deletePriceList
);

module.exports = router;
