const authService = require('../services/authService');

exports.register = async (req, res, next) => {
    try {
        const { newUser, token, refreshToken } = await authService.registerUser(req.body);
        
        res.status(201).json({ 
            success: true,
            message: 'Đăng ký thành công', 
            data: { 
                user: { id: newUser._id, email: newUser.email, fullName: newUser.fullName, role: newUser.role },
                token, 
                refreshToken 
            }
        });
    } catch (error) {   
        next(error); 
    }   
};

exports.login = async (req, res, next) => {
    try {
        const { user, token, refreshToken } = await authService.loginUser(req.body);
        
        res.status(200).json({ 
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                user: { id: user._id, fullName: user.fullName, role: user.role }, // Trả về role để FE biết đường điều hướng
                token, 
                refreshToken 
            }
        });
    } catch (error) {
        next(error);
    }
};