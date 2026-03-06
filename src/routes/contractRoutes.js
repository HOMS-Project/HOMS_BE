const express = require('express');
const router = express.Router();
const contractController = require('../controllers/contractController');
const { authenticate } = require('../middlewares/authMiddleware');

router.use(authenticate);

// Lấy thông tin hợp đồng theo ticketId
router.get('/ticket/:ticketId', contractController.getContractByTicket);

// Khách hàng đồng ý ký hợp đồng
router.post('/:id/sign', contractController.signContractCustomer);

module.exports = router;
