const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/admin/dashboardController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

// Protect all dashboard routes for admin
router.use(verifyToken);
router.use(authorize('admin'));

// GET /api/admin/dashboard/overview
router.get('/overview', dashboardController.getOverview);

// GET /api/admin/dashboard/revenue
router.get('/revenue', dashboardController.getRevenue);

// GET /api/admin/dashboard/orders
router.get('/orders', dashboardController.getOrders);

// GET /api/admin/dashboard/recent-invoices
router.get('/recent-invoices', dashboardController.getRecentInvoices);

// -- Debug endpoint (DEV ONLY) --
// Public route to quickly inspect overview data without auth. Remove in production.
router.get('/debug-overview', async (req, res, next) => {
	try {
		const adminStatisticService = require('../../services/admin/statisticService');
		const data = await adminStatisticService.getOverview();
		return res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
});

module.exports = router;

