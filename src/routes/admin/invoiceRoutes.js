const express = require('express');
const router = express.Router();
const invoiceController = require('../../controllers/admin/invoiceController');

// revenue endpoints removed per request

// GET /api/admin/invoices/:id
router.get('/:id', invoiceController.getInvoice);

// GET /api/admin/invoices/:id/einvoice - structured data for e-invoice (printable)
router.get('/:id/einvoice', invoiceController.getEinvoice);

// GET /api/admin/invoices/:id/einvoice/pdf - PDF download
// Temporarily disabled: PDF generation endpoint commented out per request
// router.get('/:id/einvoice/pdf', invoiceController.getEinvoicePdf);

// GET /api/admin/invoices
router.get('/', invoiceController.listInvoices);

// GET total revenue aggregate (PAID + PARTIAL)
router.get('/revenue-aggregate', invoiceController.getRevenueAggregate);

module.exports = router;