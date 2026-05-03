const authService = require("../services/authService");
const AppError = require("../utils/appErrors");
exports.sendRegistrationOTP = async (req, res, next) => {
  try {
    await authService.sendRegistrationOTP(req.body);
    res.status(200).json({
      success: true,
      message: "Mã OTP đã được gửi đến email của bạn",
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
      message: "Đăng ký thành công",
      data: {
        user: {
          _id: newUser._id,
          fullName: newUser.fullName,
          email: newUser.email,
          phone: newUser.phone,
          role: newUser.role,
        },
      },
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
      message: "Đăng ký thành công",
      data: {
        user: {
          _id: newUser._id,
          fullName: newUser.fullName,
          email: newUser.email,
          phone: newUser.phone,
          role: newUser.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const isMobileDriver =
      (req.get("x-client") || "").toLowerCase() === "mobile-driver";
    const { user, accessToken, refreshToken, expiresInMs } =
      await authService.loginUser(req.body);

    if (isMobileDriver && user.role !== "driver") {
      throw new AppError(
        "Chỉ tài xế (driver) mới được phép đăng nhập ứng dụng di động",
        403,
      );
    }
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      data: {
        user: {
          _id: user._id,
          fullName: user.fullName,
          role: user.role,
          email: user.email,
          createdAt: user.createdAt,
          dispatcherProfile: user.dispatcherProfile,
          phone: user.phone,
          address: user.address,
          avatar: user.avatar,
          provider: user.provider, 
          isGeneral: user.dispatcherProfile?.isGeneral || false,
          workingAreas: user.dispatcherProfile?.workingAreas || [],
        },
        accessToken,
        expiresInMs,
        ...(isMobileDriver ? { refreshToken } : {}),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.googleLogin = async (req, res, next) => {
  try {
    const isMobileDriver =
      (req.get("x-client") || "").toLowerCase() === "mobile-driver";
    const { user, accessToken, refreshToken, expiresInMs } =
      await authService.googleLogin(req.body);

    if (isMobileDriver && user.role !== "driver") {
      throw new AppError(
        "Chỉ tài xế (driver) mới được phép đăng nhập ứng dụng di động",
        403,
      );
    }

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      message: "Đăng nhập Google thành công",
      data: {
        user: {
          _id: user._id || user.id,
          fullName: user.fullName,
          role: user.role,
          email: user.email,
          createdAt: user.createdAt,
          dispatcherProfile: user.dispatcherProfile,
          phone: user.phone,
          address: user.address,
          avatar: user.avatar,
          provider: user.provider, 
          isGeneral: user.dispatcherProfile?.isGeneral || false,
          workingAreas: user.dispatcherProfile?.workingAreas || [],
        },
        accessToken,
        expiresInMs,
        ...(isMobileDriver ? { refreshToken } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
};
exports.forgotPassword = async (req, res, next) => {
  console.log("req.body:", req.body);
  try {
    const { email } = req.body;
    const isMobile = (req.get("x-client") || "").toLowerCase() === "mobile-driver";
    await authService.forgotPassword(email, { isMobile });
    res.json({ success: true, message: "OTP đã được gửi về email" });
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
      message: "Xác thực OTP thành công",
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
      message: "Đặt lại mật khẩu thành công",
    });
  } catch (err) {
    next(err);
  }
};
exports.refreshToken = async (req, res, next) => {
  try {
    const isMobileDriver = (req.get("x-client") || "").toLowerCase() === "mobile-driver";
    
    // Support both cookie-based (web) and body-based (mobile) refresh tokens
    const oldRefreshToken = isMobileDriver 
      ? (req.body?.refreshToken || req.cookies.refreshToken) 
      : req.cookies.refreshToken;

    const { accessToken, refreshToken, expiresInMs } =
      await authService.refreshAccessToken(oldRefreshToken);
    
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      accessToken,
      ...(isMobileDriver ? { refreshToken } : {}),
      expiresInMs,
    });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    await authService.logoutUser(refreshToken);
    res.clearCookie("refreshToken", {
      httpOnly: true,
      sameSite: "none",
      secure: true,
    });
    res.json({
      success: true,
      message: "Đăng xuất thành công",
    });
  } catch (err) {
    next(err);
  }
};
exports.setupMagicAccount = async (req, res,next) => {
  try {
   const { token, password,confirmPassword,phone } = req.body;

    const { user, accessToken, refreshToken, expiresInMs } = 
      await authService.setupMagicAccount({
        token,      
        password,
        confirmPassword, 
        phone
      });

    
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });

    return res.status(200).json({
      success: true,
      message: 'Thiết lập thành công',
      accessToken,
      data: { user }
    });

  } catch (error) {
     if (error.message === 'LINK_USED') {
      return res.status(400).json({ 
        success: false, 
        message: 'Link này đã được sử dụng trước đó. Vui lòng đăng nhập hoặc yêu cầu gửi lại link mới.' 
      });
    }
   next(error);
  }
};

exports.facebookLogin = async (req, res, next) => {
  try {
    // 1. Lấy token từ body (do Facebook SDK hoặc phía App gửi về)
    const { user, accessToken, refreshToken, expiresInMs } = await authService.facebookLogin(req.body);

    // 2. Thiết lập Cookie (cho trình duyệt)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 3. Trả về thông tin cho khách hàng
    res.json({
      success: true,
      message: "Đăng nhập Facebook thành công",
      data: {
        user: {
         _id: user._id || user.id,
          fullName: user.fullName,
          role: user.role, 
          email: user.email,
            phone: user.phone,      
      address: user.address, 
          avatar: user.avatar,
           provider: user.provider, 
        },
        accessToken,
        expiresInMs,
      },
    });
  } catch (err) {
    next(err);
  }
};
exports.linkMessengerAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;       
    const userEmail = req.user.email;  
    const { linkToken } = req.body;

    const updatedUser = await authService.linkMessengerAccountService(
      userId,
      userEmail,
      linkToken
    );

    return res.status(200).json({
      message: "Liên kết Messenger thành công",
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};