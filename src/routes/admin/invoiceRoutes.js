const express = require('express');
const router = express.Router();
const invoiceController = require('../../controllers/admin/invoiceController');

// revenue endpoints removed per request

// GET /api/admin/invoices/:id
router.get('/:id', invoiceController.getInvoice);

// GET /api/admin/invoices
router.get('/', invoiceController.listInvoices);

// GET total revenue aggregate (PAID + PARTIAL)
router.get('/revenue-aggregate', invoiceController.getRevenueAggregate);

module.exports = router;