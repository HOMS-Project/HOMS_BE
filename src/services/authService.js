const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateToken, generateRefreshToken } = require('../utils/token');
const AppError = require('../utils/appErrors'); 
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const client = new OAuth2Client(process.env.CLIENT_ID);
const jwt = require('jsonwebtoken');
// Hàm đăng ký
exports.registerUser = async ({ fullName, email, password, phone }) => {
    // Check trùng cả Email lẫn Phone
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {

        throw new AppError('Email hoặc số điện thoại đã tồn tại', 400); 
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 3. Tạo user mới
    const newUser = new User({
        fullName,
        email,
        password: hashedPassword,
        phone
    });

    // 4. Lưu vào DB
    await newUser.save();
    return  newUser ;
};

// Hàm đăng nhập
exports.loginUser = async ({ email, password }) => {
    // 1. Tìm user
    const user = await User.findOne({ email });
    
    // --- SỬA LỖI Ở ĐÂY ---
    if (!user) {
        throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }
if (!user.password) {
  throw new AppError(
    'Tài khoản này đăng nhập bằng Google. Vui lòng sử dụng Google Login.',
    400
  );
}

    // 2. So khớp mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
        
    // --- SỬA LỖI Ở ĐÂY ---
    if (!isMatch) {
        throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }

    // 3. Sinh token
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);
const hashedRefreshToken = crypto
  .createHash('sha256')
  .update(refreshToken)
  .digest('hex');

user.refreshTokens.push({
  token: hashedRefreshToken,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
});
await user.save();
    return { user, accessToken };
};

exports.refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new AppError('No refresh token provided', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (err) {
    throw new AppError('Refresh token invalid or expired', 401);
  }

  const user = await User.findById(decoded.userId);
  if (!user) {
    throw new AppError('User not found', 401);
  }
const hashedRefreshToken = crypto
  .createHash('sha256')
  .update(refreshToken)
  .digest('hex');
  // Tìm refresh token trong DB
  const tokenIndex = user.refreshTokens.findIndex(
    (t) => t.token === hashedRefreshToken
  );

 if (tokenIndex === -1) {
  
  user.refreshTokens = []; // revoke all sessions
  await user.save();
  throw new AppError('Refresh token reuse detected', 401);
}


  const tokenInDb = user.refreshTokens[tokenIndex];

  if (tokenInDb.expiresAt < new Date()) {
    // Xóa token hết hạn
    user.refreshTokens.splice(tokenIndex, 1);
    await user.save();
    throw new AppError('Refresh token expired', 401);
  }

 
  const newAccessToken = generateToken(user);
  const newRefreshToken = generateRefreshToken(user);

  // Xóa refresh token cũ
  user.refreshTokens.splice(tokenIndex, 1);
const hashedNewRefreshToken = crypto
  .createHash('sha256')
  .update(newRefreshToken)
  .digest('hex');

  // Lưu refresh token mới
  user.refreshTokens.push({
    token: hashedNewRefreshToken,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await user.save();

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};



exports.googleLogin = async ({ token }) => {
  if (!token) {
    const err = new Error("No Google token provided");
    err.statusCode = 400;
    throw err;
  }

  // Verify token Google
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const { email, name, picture, sub } = payload;

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      fullName: name || 'Google User',
      email,
      googleId: sub,
      provider: "google",
      status: "Active",
      verified: true,
      role: "customer",
      avatar: picture,
    });
  } else {

    if (user.status === "Inactive") {
      const err = new Error("Tài khoản chưa kích hoạt.");
      err.statusCode = 403;
      throw err;
    }

    if (user.status === "Blocked") {
      const err = new Error("Tài khoản đã bị khóa.");
      err.statusCode = 403;
      throw err;
    }
  }
  const accessToken = generateToken(user);
  const refreshToken = generateRefreshToken(user);
  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    },
  };
};
exports.forgotPassword = async (email) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError("Không tìm thấy tài khoản với email này", 404);
  }
  if (user.provider === "google") {
    throw new AppError("Tài khoản Google không thể đặt lại mật khẩu", 400);
  }
  // Sinh OTP 6 số
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  // Hash OTP
  const hashedOtp = await bcrypt.hash(otp, 10);
  user.otpResetPassword = hashedOtp;
  user.otpResetExpires = Date.now() + 5 * 60 * 1000; 
  await user.save();
  const transporter = nodemailer.createTransport({
    
    service: "Gmail",
    auth: {
      user: process.env.AUTH_EMAIL,
      pass: process.env.AUTH_PASS,
    },
  });
await transporter.verify();
console.log("SMTP OK");

  await transporter.sendMail({
    from: `"Support" <${process.env.AUTH_EMAIL}>`,
    to: user.email,
    subject: "Your OTP to reset password",
    html: `
      <p>Mã OTP đặt lại mật khẩu của bạn là:</p>
      <h2>${otp}</h2>
      <p>Mã có hiệu lực trong <b>5 phút</b>.</p>
    `,
  });

  return true;
};

exports.resetPassword = async (token, password) => {
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new AppError("Invalid or expired token", 400);
  }

  user.password = password; 
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();
};
exports.resetPasswordWithOtp = async ({ email, otp, newPassword }) => {
  const user = await User.findOne({
    email,
    otpResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new AppError("OTP không hợp lệ hoặc đã hết hạn", 400);
  }

  const isOtpValid = await bcrypt.compare(otp, user.otpResetPassword);
  if (!isOtpValid) {
    throw new AppError("OTP không chính xác", 400);
  }

  // Hash password mới
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  user.password = hashedPassword;
  user.otpResetPassword = undefined;
  user.otpResetExpires = undefined;

  await user.save();
};
