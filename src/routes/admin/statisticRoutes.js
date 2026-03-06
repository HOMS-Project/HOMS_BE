const express = require('express');
const router = express.Router();
const adminStatisticController = require('../../controllers/admin/statisticController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

// Chỉ Admin mới được truy cập các routes này
router.use(verifyToken);
router.use(authorize('admin'));

// Route: /api/admin/statistics/revenue
router.get('/revenue', adminStatisticController.getRevenueStats);

// Route: /api/admin/statistics/orders
router.get('/orders', adminStatisticController.getOrderStats);

// Route: /api/admin/statistics/overview
router.get('/overview', adminStatisticController.getOverview);

module.exports = router;
