const Joi = require('joi');

// Middleware validate
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path[0],
        message: detail.message
      }));
      return res.status(400).json({
        message: 'Dữ liệu không hợp lệ',
        errors
      });
    }
    next();
  };
};

// Regex mật khẩu
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

const schemas = {
  register: Joi.object({
    fullName: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[\p{L}\s]+$/u)
      .required()
      .messages({
        'string.empty': 'Họ tên không được để trống',
        'string.min': 'Họ tên phải từ 2 ký tự trở lên',
        'string.pattern.base': 'Họ tên không được chứa ký tự đặc biệt hoặc số',
        'any.required': 'Họ tên là bắt buộc'
      }),

    email: Joi.string()
      .email({ tlds: { allow: false } })
      .required()
      .messages({
        'string.empty': 'Email không được để trống',
        'string.email': 'Email không hợp lệ',
        'any.required': 'Email là bắt buộc'
      }),

    password: Joi.string()
      .pattern(passwordRegex)
      .required()
      .messages({
        'string.empty': 'Mật khẩu không được để trống',
        'string.pattern.base':
          'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, thường, số và ký tự đặc biệt',
        'any.required': 'Mật khẩu là bắt buộc'
      }),
  confirmPassword: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Mật khẩu xác nhận không khớp',
      'any.required': 'Vui lòng xác nhận mật khẩu'
    }),
    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .required()
      .messages({
        'string.empty': 'Số điện thoại không được để trống',
        'string.pattern.base': 'Số điện thoại phải bao gồm đúng 10 chữ số',
        'any.required': 'Số điện thoại là bắt buộc'
      }),
  }),

  login: Joi.object({
    email: Joi.string()
      .email()
      .required()
      .messages({
        'string.empty': 'Email không được để trống',
        'string.email': 'Email không hợp lệ',
        'any.required': 'Vui lòng nhập email'
      }),

    password: Joi.string()
      .required()
      .messages({
        'string.empty': 'Mật khẩu không được để trống',
        'any.required': 'Vui lòng nhập mật khẩu'
      })
  }),

};

module.exports = { validate, schemas };