const rateLimit = require('express-rate-limit');

const baseConfig = {
  standardHeaders: true,
  legacyHeaders: false,
};

exports.loginLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    status: 'fail',
    message: 'Bạn thử đăng nhập quá nhiều lần, vui lòng thử lại sau'
  }
});

exports.registerLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 10
});

exports.googleLoginLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 20
});

exports.forgotPasswordLimiter = rateLimit({
  ...baseConfig,
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: {
    status: 'fail',
    message: 'Bạn yêu cầu OTP quá nhiều lần'
  }
});

exports.otpLimiter = rateLimit({
  ...baseConfig,
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: {
    status: 'fail',
    message: 'Bạn nhập OTP quá nhiều lần'
  }
});