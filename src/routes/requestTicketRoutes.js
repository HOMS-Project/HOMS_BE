const express = require('express');
const router = express.Router();
const requestTicketController = require('../controllers/requestTicketController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

/**
 * REQUEST TICKET ENDPOINTS
 */
router.get('/', authenticate, requestTicketController.listRequestTickets);
router.get('/:id', authenticate, requestTicketController.getRequestTicket);
router.get("/:id/verify-payment", authenticate, authorize('CUSTOMER'), requestTicketController.verifyPaymentStatus);

router.post("/:id/create-payment-link", authenticate, authorize('CUSTOMER'), requestTicketController.createSurveyPayment);
router.post("/:id/deposit", authenticate, authorize('CUSTOMER'), requestTicketController.createMovingDepositPayment);
router.post('/:id/remaining', authenticate, authorize('CUSTOMER'), requestTicketController.createMovingRemainingPayment);
router.post('/', authenticate, authorize('CUSTOMER'), requestTicketController.createRequestTicket);
router.post('/:id/approve', authenticate, authorize('ADMIN', 'DISPATCHER'), requestTicketController.approveTicket);

router.put('/:id/accept-survey-time', authenticate, authorize('CUSTOMER'), requestTicketController.acceptSurveyTime);
// router.put('/:id/reject-survey-time',authenticate,authorize('CUSTOMER'),requestTicketController.rejectSurveyTime);
router.put('/:id/cancel', authenticate, requestTicketController.cancelRequestTicket);
router.put('/:id/propose-time', authenticate, authorize('ADMIN', 'DISPATCHER'), requestTicketController.proposeSurveyTime);
router.put('/:id/accept-quote', authenticate, authorize('CUSTOMER'), requestTicketController.acceptQuote);

module.exports = router;