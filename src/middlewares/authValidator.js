const { body, validationResult } = require('express-validator');

const passwordStrongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
// Giải thích regex:
// - Ít nhất 8 ký tự
// - Ít nhất 1 chữ thường
// - Ít nhất 1 chữ hoa
// - Ít nhất 1 số
// - Ít nhất 1 ký tự đặc biệt

exports.registerValidator = [
  body('fullName')
    .notEmpty().withMessage('Tên không được để trống').bail()
    .isLength({ min: 2, max: 50 }).withMessage('Tên phải từ 2 đến 50 ký tự')
    .matches(/^[\p{L}\s]+$/u).withMessage('Tên chỉ được chứa chữ cái và khoảng trắng'),

  body('email')
    .notEmpty().withMessage('Email không được để trống').bail()
    .isEmail().withMessage('Email không hợp lệ').bail()
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Mật khẩu không được để trống').bail()
    .isLength({ min: 8 }).withMessage('Mật khẩu phải có ít nhất 8 ký tự').bail()
    .matches(passwordStrongRegex).withMessage(
      'Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt'
    ),

    body('gender')
    .optional()
    .isIn(['male','female','other']).withMessage('Giới tính không hợp lệ'),
body('role')
  .optional()
  .custom((value) => {
    const allowed = ['owner', 'customer'];
    if (!allowed.includes(value)) {
      throw new Error('Vai trò không hợp lệ');
    }
    return true;
  })
,
  
  body('status')
  .optional()
  .custom((value) => {
    const allowed = ['active', 'inactive', 'banned'];
    if (!allowed.includes(value)) {
      throw new Error('Trạng thái không hợp lệ');
    }
    if (value === 'banned') {
      throw new Error('Tài khoản đã bị cấm (banned)');
    }
    return true;
  })
    ,

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array().map(err => ({
          msg: err.msg,
          param: err.path
        }))
      });
    }
    next();
  }
];

exports.loginValidator = [
  body('email')
    .notEmpty().withMessage('Email không được để trống').bail()
    .isEmail().withMessage('Email không hợp lệ').bail()
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Mật khẩu không được để trống'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array().map(err => ({
          msg: err.msg,
          param: err.path
        }))
      });
    }
    next();
  }
];

exports.resetPasswordValidator = [
  body('password')
    .notEmpty().withMessage('Mật khẩu không được để trống').bail()
    .isLength({ min: 8 }).withMessage('Mật khẩu phải có ít nhất 8 ký tự').bail()
    .matches(passwordStrongRegex).withMessage(
      'Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt'
    ),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array().map(err => ({
          msg: err.msg,
          param: err.path
        }))
      });
    }
    next();
  }
];
exports.updateUserInfoValidator = [
  body('fullName')
    .optional()
    .isLength({ min: 2, max: 50 }).withMessage('Tên phải từ 2 đến 50 ký tự')
    .matches(/^[\p{L}\s]+$/u).withMessage('Tên chỉ được chứa chữ cái và khoảng trắng'),

  body('phone')
    .optional()
    .matches(/^[0-9]{10}$/).withMessage('Số điện thoại phải có đúng 10 chữ số'),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array().map(err => ({
          msg: err.msg,
          param: err.path
        }))
      });
    }
    next();
  }
];
