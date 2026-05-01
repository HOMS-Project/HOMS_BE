const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/admin/orderController');

// GET /api/admin/orders
router.get('/', orderController.listOrders);
// GET /api/admin/orders/:id
router.get('/:id', orderController.getOrder);

module.exports = router;
