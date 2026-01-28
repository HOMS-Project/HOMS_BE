const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validate, schemas } = require('../middlewares/validationMiddleware'); 

router.post('/register', validate(schemas.register), authController.register);
router.post('/login', validate(schemas.login), authController.login);
router.post('/google-login',authController.googleLogin)
router.post('/send-otp', authController.resetPassword);
router.post('/forgot-password', authController.forgotPassword);
module.exports = router;