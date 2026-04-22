const express = require('express');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.get('/packages', insuranceController.getPackages);
router.post('/calculate', verifyToken, insuranceController.calculatePremium);

module.exports = router;
