const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Public endpoint - validate order data (no auth required)
router.post('/validate', orderController.validateOrderData);

// Create new order - REQUIRES AUTHENTICATION
router.post('/create', verifyToken, orderController.createOrder);

// Protected routes - require authentication
router.use(verifyToken);

// Get all orders for current user
router.get('/my-orders', orderController.getMyOrders);

// Get specific order by ID
router.get('/:ticketId', orderController.getOrderById);

// Cancel order
router.patch('/:ticketId/cancel', orderController.cancelOrder);

module.exports = router;
