const express = require('express');
const router = express.Router();
const invoiceController = require('../../controllers/admin/invoiceController');

// revenue endpoints removed per request

// GET /api/admin/invoices/:id
router.get('/:id', invoiceController.getInvoice);

// GET /api/admin/invoices
router.get('/', invoiceController.listInvoices);

module.exports = router;