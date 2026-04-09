const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { authenticate,authorize } = require('../middlewares/authMiddleware');

router.use(authenticate);

router.get('/my-contracts',           authorize('CUSTOMER'), contractController.getMyContracts);
router.get('/:contractId',            authorize('CUSTOMER'), contractController.getContractDetail);
router.get('/:contractId/download',   authorize('CUSTOMER'), contractController.downloadContract);
// Lấy thông tin hợp đồng theo ticketId
router.get('/ticket/:ticketId', contractController.getContractByTicket);

// Khách hàng đồng ý ký hợp đồng
router.post('/:id/sign', contractController.signContractCustomer);
// routes/contractRoutes.js
router.post('/:id/request-otp',authorize('CUSTOMER'), contractController.requestSignOtp);
router.post('/:id/signs', authorize('CUSTOMER'),   contractController.signContract);
module.exports = router;
