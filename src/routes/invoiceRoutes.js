/**
 * Routes cho Invoice
 */

const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

/**
 * INVOICE ENDPOINTS
 */

router.get('/', authenticate, invoiceController.listInvoices);
router.get('/:invoiceId', authenticate, invoiceController.getInvoice);
router.get('/ticket/:ticketId', authenticate, invoiceController.getInvoiceByTicket);
router.get('/:invoiceId/timeline', authenticate, invoiceController.getTimeline);

router.post('/from-ticket/:requestTicketId', authenticate, invoiceController.createInvoiceFromTicket, invoiceController.confirmInvoice);
router.post('/optimal-squad', authenticate, invoiceController.suggestOptimalSquad);
router.post('/:invoiceId/dispatch', authenticate, invoiceController.dispatchVehicles);

router.put('/:invoiceId/cancel', authenticate, invoiceController.cancelInvoice);

module.exports = router;
