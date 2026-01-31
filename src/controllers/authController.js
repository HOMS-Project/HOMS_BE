const authService = require('../services/authService');

exports.sendRegistrationOTP = async (req, res, next) => {
  try {
    await authService.sendRegistrationOTP(req.body);
    res.status(200).json({
      success: true,
      message: 'Mã OTP đã được gửi đến email của bạn'
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyRegistrationOTP = async (req, res, next) => {
  try {
    const newUser = await authService.verifyRegistrationOTP(req.body);
    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      data: {
        user: {
          id: newUser._id,
          fullName: newUser.fullName,
          email: newUser.email,
          phone: newUser.phone,
          role: newUser.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Giữ lại endpoint cũ để tương thích
exports.register = async (req, res, next) => {
  try {
    const newUser = await authService.registerUser(req.body);

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      data: {
        user: {
          id: newUser._id,
          fullName: newUser.fullName,
          email: newUser.email,
          phone: newUser.phone,
          role: newUser.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
};


exports.login = async (req, res, next) => {
    try {
        const { user, accessToken, refreshToken } = await authService.loginUser(req.body);
        
        res.status(200).json({ 
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                user: { id: user._id, fullName: user.fullName, role: user.role }, // Trả về role để FE biết đường điều hướng
                accessToken, 
                refreshToken 
            }
        });
    } catch (error) {
        next(error);
    }
};

exports.googleLogin = async (req, res, next) => {
  try {
    const result = await authService.googleLogin(req.body);
    return res.json({
      message: "Đăng nhập google thành công",
      ...result,
    });
  } catch (error) {
    next(error); 
  }
};
exports.forgotPassword = async (req, res, next) => {
     console.log("req.body:", req.body); 
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);
    res.json({ message: "OTP đã được gửi về email" });
  } catch (err) {
    next(err);
  }
};

exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    await authService.verifyOTP({ email, otp });
    res.json({ 
      success: true,
      message: "Xác thực OTP thành công" 
    });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, newPassword } = req.body;
    await authService.resetPasswordWithEmail({ email, newPassword });
    res.json({ 
      success: true,
      message: "Đặt lại mật khẩu thành công" 
    });
  } catch (err) {
    next(err);
  }
};
