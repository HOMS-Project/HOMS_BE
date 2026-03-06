const express = require('express');
const router = express.Router();
const adminPriceListController = require('../../controllers/admin/priceListController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

// Chỉ Admin/Staff được chỉnh sửa bảng giá
router.use(verifyToken);

// Route: /api/admin/price-lists
router.route('/')
    .get(authorize(['admin', 'staff']), adminPriceListController.getAllPriceLists)
    .post(authorize('admin'), adminPriceListController.createPriceList); // Chỉ admin được tạo

// Route: /api/admin/price-lists/:id
router.route('/:id')
    .get(authorize(['admin', 'staff']), adminPriceListController.getPriceListById)
    .put(authorize('admin'), adminPriceListController.updatePriceList)
    .delete(authorize('admin'), adminPriceListController.deletePriceList);

module.exports = router;
