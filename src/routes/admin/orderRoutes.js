const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/admin/orderController');

// GET /api/admin/orders
router.get('/', orderController.listOrders);

module.exports = router;
