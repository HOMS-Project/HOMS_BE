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

router.put('/:invoiceId/cancel', authenticate, invoiceController.cancelInvoice);

// Scenario B: Customer confirms or rejects a dispatcher-proposed dispatch reschedule
router.patch('/:invoiceId/confirm-reschedule', authenticate, authorize('customer'), invoiceController.confirmReschedule);

// REQUIRE_CUSTOMER: Customer approves understaffed dispatch
router.patch('/:id/confirm-understaffed', authenticate, authorize('customer'), invoiceController.confirmUnderstaffed);

module.exports = router;
