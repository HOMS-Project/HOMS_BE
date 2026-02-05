const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const {verifyToken} = require('../middlewares/authMiddleware')
const {
  loginLimiter,
  registerLimiter,
} = require('../middlewares/rateLimitMiddleware');
const { validate, schemas } = require('../middlewares/validationMiddleware'); 

router.post('/register', registerLimiter, validate(schemas.register), authController.register);
router.post('/send-registration-otp', validate(schemas.register), authController.sendRegistrationOTP);
router.post('/verify-registration-otp', authController.verifyRegistrationOTP);
router.post('/login',loginLimiter, validate(schemas.login), authController.login);
router.post('/google-login',authController.googleLogin)
router.post('/send-otp', authController.resetPassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOTP);
router.post('/reset-password', authController.resetPassword);
router.post('/refresh', authController.refreshToken);
module.exports = router;