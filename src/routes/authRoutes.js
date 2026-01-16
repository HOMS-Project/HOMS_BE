const express = require('express');
const { registerValidator, loginValidator } = require('../middlewares/authValidator');
const router = express.Router();
const authController = require('../controllers/authController');

// Đăng ký người dùng mới
router.post('/register', registerValidator, authController.register);
// Đăng nhập người dùng
router.post('/login', loginValidator, authController.login);

module.exports = router;