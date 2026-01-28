const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validate, schemas } = require('../middlewares/validationMiddleware'); 
const {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  googleLoginLimiter,otpLimiter,refreshToken
} = require('../middlewares/rateLimitMiddleware');
router.post('/register',registerLimiter, validate(schemas.register), authController.register);
router.post('/login',loginLimiter, validate(schemas.login), authController.login);
router.post('/google-login',googleLoginLimiter,authController.googleLogin)
router.post('/send-otp', authController.resetPassword);
router.post('/forgot-password',authController.forgotPassword);
router.post('/refresh', authController.refreshToken);
module.exports = router;