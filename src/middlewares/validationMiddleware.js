const Joi = require('joi');

// Hàm middleware xử lý validate (Giữ nguyên cái của bạn vì nó đã tốt)
const validate = (schema) => {
    return (req, res, next) => {   
        const { error } = schema.validate(req.body, { abortEarly: false });     
        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path[0],
                message: detail.message
            }));
            return res.status(400).json({ message: 'Dữ liệu không hợp lệ', errors });
        }
        next();
    };
};

// Regex mật khẩu 
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

const schemas = {
    register: Joi.object({
        fullName: Joi.string()
            .min(2).max(50)
            .pattern(/^[\p{L}\s]+$/u) // chỉ lấy chữ cái
            .required()
            .messages({
                'string.empty': 'Họ tên không được để trống',
                'string.min': 'Họ tên phải từ 2 ký tự trở lên',
                'string.pattern.base': 'Họ tên không được chứa ký tự đặc biệt hoặc số',
                'any.required': 'Họ tên là bắt buộc'
            }),

        email: Joi.string()
            .email({ tlds: { allow: false } }) // Validate email 
            .required()
            .messages({
                'string.email': 'Email không hợp lệ',
                'any.required': 'Email là bắt buộc'
            }),

        password: Joi.string()
            .pattern(passwordRegex)
            .required()
            .messages({
                'string.pattern.base': 'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, thường, số và ký tự đặc biệt',
                'any.required': 'Mật khẩu là bắt buộc'
            }),

        phone: Joi.string()
            .pattern(/^[0-9]{10}$/) // Chỉ chấp nhận 10 số
            .required()
            .messages({
                'string.pattern.base': 'Số điện thoại phải bao gồm đúng 10 chữ số',
                'any.required': 'Số điện thoại là bắt buộc'
            }),

        role: Joi.string()
            .valid('owner', 'customer') // Chỉ chấp nhận 2 role này
            .default('customer')
            .messages({
                'any.only': 'Vai trò không hợp lệ (chỉ chấp nhận owner hoặc customer)'
            }),
            
        gender: Joi.string()
            .valid('male', 'female', 'other')
            .optional()
    }),

    login: Joi.object({
        email: Joi.string().email().required().messages({'any.required': 'Vui lòng nhập email'}),
        password: Joi.string().required().messages({'any.required': 'Vui lòng nhập mật khẩu'})
    })
};

module.exports = { validate, schemas };