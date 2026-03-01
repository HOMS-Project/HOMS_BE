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

// GET /api/invoices - Lấy danh sách
router.get(
  '/',
  authenticate,
  invoiceController.listInvoices
);

// GET /api/invoices/:id - Lấy chi tiết
router.get(
  '/:id',
  authenticate,
  invoiceController.getInvoice
);

// POST /api/invoices/from-ticket/:requestTicketId - Tạo invoice từ request ticket
router.post(
  '/from-ticket/:requestTicketId',
  authenticate,
  invoiceController.createInvoiceFromTicket,
  invoiceController.confirmInvoice
);

// POST /api/invoices/:id/dispatch - Phân công vehicles
router.post(
  '/:id/dispatch',
  authenticate,
  invoiceController.dispatchVehicles
);

// PUT /api/invoices/:id/status/:newStatus - Cập nhật status
router.put(
  '/:id/status/:newStatus',
  authenticate,
  invoiceController.updateInvoiceStatus
);

// GET /api/invoices/:id/timeline - Lấy timeline
router.get(
  '/:id/timeline',
  authenticate,
  invoiceController.getTimeline
);

// PUT /api/invoices/:id/cancel - Hủy invoice
router.put(
  '/:id/cancel',
  authenticate,
  invoiceController.cancelInvoice
);

module.exports = router;
