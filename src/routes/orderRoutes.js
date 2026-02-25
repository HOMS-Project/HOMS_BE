const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(verifyToken);

// Create new order
router.post('/create', orderController.createOrder);

// Get all orders for current user
router.get('/my-orders', orderController.getMyOrders);

// Get specific order by ID
router.get('/:ticketId', orderController.getOrderById);

// Cancel order
router.patch('/:ticketId/cancel', orderController.cancelOrder);

module.exports = router;
