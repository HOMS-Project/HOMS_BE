const express = require('express');
const router = express.Router();
const requestTicketController = require('../controllers/requestTicketController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

/**
 * REQUEST TICKET ENDPOINTS
 */
router.post(
  "/:id/create-payment-link",
  authenticate,
  authorize('CUSTOMER'),
  requestTicketController.createPaymentLink
);
// GET list
router.get(
  '/',
  authenticate,
  requestTicketController.listRequestTickets
);

// CREATE
router.post(
  '/',
  authenticate,
  authorize('CUSTOMER'),
  requestTicketController.createRequestTicket
);

// GET detail
router.get(
  '/:id',
  authenticate,
  requestTicketController.getRequestTicket
);

// CANCEL
router.put(
  '/:id/cancel',
  authenticate,
  requestTicketController.cancelRequestTicket
);

// PROPOSE SURVEY TIME
router.put(
  '/:id/propose-time',
  authenticate,
  authorize('ADMIN', 'DISPATCHER'),
  requestTicketController.proposeSurveyTime
);

// ACCEPT QUOTE
router.put(
  '/:id/accept-quote',
  authenticate,
  authorize('CUSTOMER'),
  requestTicketController.acceptQuote
);



module.exports = router;