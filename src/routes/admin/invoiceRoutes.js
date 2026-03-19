const express = require('express');
const router = express.Router();
const invoiceController = require('../../controllers/admin/invoiceController');

// GET /api/admin/invoices/:id
router.get('/:id', invoiceController.getInvoice);

// GET /api/admin/invoices
router.get('/', invoiceController.listInvoices);

module.exports = router;
