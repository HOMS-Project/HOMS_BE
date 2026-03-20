const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

// Tất cả các routes này yêu cầu đăng nhập
router.use(authenticate);

// Staff list their assigned orders
router.get('/orders', staffController.getAssignedOrders);

// Get detail of a specific order
router.get('/orders/:invoiceId', staffController.getOrderDetails);

// Update status of a specific assignment
router.patch('/assignments/:assignmentId/status', staffController.updateAssignmentStatus);

module.exports = router;
