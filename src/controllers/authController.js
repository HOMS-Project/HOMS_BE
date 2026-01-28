const authService = require('../services/authService');

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
           res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
secure: process.env.NODE_ENV === 'production',

      maxAge: 7 * 24 * 60 * 60 * 1000
    });
        res.status(200).json({ 
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                user: { id: user._id, fullName: user.fullName, role: user.role }, // Trả về role để FE biết đường điều hướng
                accessToken
            }
        });
    } catch (error) {
        next(error);
    }
};
exports.googleLogin = async (req, res, next) => {
  try {
    const { user, accessToken, refreshToken } =
      await authService.googleLogin(req.body);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'Đăng nhập Google thành công',
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          role: user.role
        },
        accessToken
      }
    });
  } catch (err) {
    next(err);
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

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    await authService.resetPasswordWithOtp({ email, otp, newPassword });
    res.json({ message: "Đặt lại mật khẩu thành công" });
  } catch (err) {
    next(err);
  }
};
exports.refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const accessToken = await authService.refreshAccessToken(refreshToken);

    res.json({
      success: true,
      accessToken
    });
  } catch (err) {
    next(err);
  }
};
