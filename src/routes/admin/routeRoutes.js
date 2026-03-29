const express = require('express');
const router = express.Router();
const adminRouteController = require('../../controllers/admin/routeController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

// Chỉ Admin/Staff (tùy nghiệp vụ) được truy cập
router.use(verifyToken);
router.use(authorize('admin', 'staff', 'dispatcher')); // Dispatcher cần xem luật để điều phối

// Route: /api/admin/routes
router.route('/')
    .get(adminRouteController.getAllRoutes)
    .post(authorize('admin', 'staff'), adminRouteController.createRoute); // Chỉ admin/staff dc tạo

// Route: /api/admin/routes/:id
router.route('/:id')
    .get(adminRouteController.getRouteById)
    .put(authorize('admin', 'staff'), adminRouteController.updateRoute) // Cập nhật chung
    .delete(authorize('admin'), adminRouteController.deleteRoute); // Chỉ admin xóa/deactivate

// Route thêm luật giao thông cho 1 route cụ thể
router.post('/:id/rules', authorize('admin', 'staff'), adminRouteController.addTrafficRule);

// Route thêm hạn chế đường bộ (street level) cho 1 route cụ thể
router.post('/:id/road-restrictions', authorize('admin', 'staff'), adminRouteController.addRoadRestriction);

module.exports = router;
