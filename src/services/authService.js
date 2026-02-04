const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateToken, generateRefreshToken } = require('../utils/token');
const AppError = require('../utils/appErrors'); 
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const jwt = require ("jsonwebtoken")
const nodemailer = require("nodemailer");
const client = new OAuth2Client(process.env.CLIENT_ID);

// Lưu tạm thông tin đăng ký (có thể dùng Redis hoặc Collection riêng trong production)
const pendingRegistrations = new Map();

// Hàm gửi OTP khi đăng ký
exports.sendRegistrationOTP = async ({ fullName, email, password, phone }) => {
    // Check trùng cả Email lẫn Phone
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
        throw new AppError('Email hoặc số điện thoại đã tồn tại', 400); 
    }

    // Sinh OTP 6 số
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Hash password và OTP
    const hashedPassword = await bcrypt.hash(password, 12);
    const hashedOtp = await bcrypt.hash(otp, 10);
    
    // Lưu tạm thông tin đăng ký với OTP
    pendingRegistrations.set(email, {
        fullName,
        email,
        password: hashedPassword,
        phone,
        otp: hashedOtp,
        otpExpires: Date.now() + 1 * 60 * 1000 // 1 phút
    });

    // Gửi OTP qua email
    const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.AUTH_EMAIL,
            pass: process.env.AUTH_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    try {
        await transporter.verify();
        await transporter.sendMail({
            from: `"HOMS Support" <${process.env.AUTH_EMAIL}>`,
            to: email,
            subject: "Xác thực đăng ký tài khoản - HOMS System",
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #44624A;">Xác thực đăng ký HOMS</h2>
                    <p>Xin chào <b>${fullName}</b>,</p>
                    <p>Cảm ơn bạn đã đăng ký tài khoản HOMS. Mã OTP xác thực của bạn là:</p>
                    <div style="background-color: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #44624A; letter-spacing: 5px; margin: 0;">${otp}</h1>
                    </div>
                    <p>Mã có hiệu lực trong <b>1 phút</b>.</p>
                    <p style="color: #999; font-size: 12px;">Nếu bạn không thực hiện đăng ký này, vui lòng bỏ qua email này.</p>
                </div>
            `,
        });
        console.log(`✅ Registration OTP sent to ${email}`);
    } catch (error) {
        console.error("❌ Error sending email:", error);
        throw new AppError("Không thể gửi email. Vui lòng kiểm tra cấu hình email.", 500);
    }

    return true;
};

// Hàm verify OTP và tạo tài khoản
exports.verifyRegistrationOTP = async ({ email, otp }) => {
    const registration = pendingRegistrations.get(email);
    
    if (!registration) {
        throw new AppError("Không tìm thấy thông tin đăng ký. Vui lòng đăng ký lại.", 400);
    }

    // Kiểm tra OTP hết hạn
    if (Date.now() > registration.otpExpires) {
        pendingRegistrations.delete(email);
        throw new AppError("OTP đã hết hạn. Vui lòng đăng ký lại.", 400);
    }

    // Verify OTP
    const isOtpValid = await bcrypt.compare(otp, registration.otp);
    if (!isOtpValid) {
        throw new AppError("OTP không chính xác", 400);
    }

    // Check lại xem email/phone có bị trùng không (phòng trường hợp đăng ký trùng trong lúc chờ OTP)
    const existingUser = await User.findOne({ 
        $or: [{ email: registration.email }, { phone: registration.phone }] 
    });
    if (existingUser) {
        pendingRegistrations.delete(email);
        throw new AppError('Email hoặc số điện thoại đã tồn tại', 400); 
    }

    // Tạo user mới
    const newUser = new User({
        fullName: registration.fullName,
        email: registration.email,
        password: registration.password, // Đã được hash
        phone: registration.phone
    });

    await newUser.save();
    
    // Xóa thông tin tạm
    pendingRegistrations.delete(email);
    
    return newUser;
};

// Hàm đăng ký (giữ lại để tương thích)
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
    const user = await User.findOne({ email }).select('+password');
    
    // --- SỬA LỖI Ở ĐÂY ---
    if (!user) {
        throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }
   if (!password || !user.password) {
        throw new AppError('Dữ liệu xác thực không hợp lệ', 401);
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
 const decoded = jwt.decode(accessToken);
    const expiresInMs = (decoded.exp - decoded.iat) * 1000;
await storeRefreshToken(user, refreshToken);

    return { user, accessToken,refreshToken,expiresInMs };
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
  } catch {
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

  const tokenIndex = user.refreshTokens.findIndex(
    (t) => t.token === hashedRefreshToken
  );

  if (tokenIndex === -1) {
    user.refreshTokens = [];
    await user.save();
    throw new AppError('Refresh token reuse detected', 401);
  }

  const tokenInDb = user.refreshTokens[tokenIndex];
  if (tokenInDb.expiresAt < new Date()) {
    user.refreshTokens.splice(tokenIndex, 1);
    await user.save();
    throw new AppError('Refresh token expired', 401);
  }

  // rotate token
  const newAccessToken = generateToken(user);
  const newRefreshToken = generateRefreshToken(user);

  user.refreshTokens.splice(tokenIndex, 1);

await storeRefreshToken(user, newRefreshToken);

const newDecoded = jwt.decode(newAccessToken); 
const expiresInMs = (newDecoded.exp - newDecoded.iat) * 1000;
  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresInMs
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
  const decoded = jwt.decode(accessToken);
const expiresInMs = (decoded.exp - decoded.iat) * 1000;
await storeRefreshToken(user, refreshToken);
  return {
    accessToken,
    refreshToken,
      expiresInMs,
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
  user.otpResetExpires = Date.now() + 1 * 60 * 1000; // 1 phút
  await user.save();

  // Cấu hình transporter với Gmail
  const transporter = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.AUTH_EMAIL,
      pass: process.env.AUTH_PASS,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    // Verify SMTP connection
    await transporter.verify();
    console.log("✅ SMTP connection successful");

    // Gửi email
    await transporter.sendMail({
      from: `"HOMS Support" <${process.env.AUTH_EMAIL}>`,
      to: user.email,
      subject: "Mã OTP đặt lại mật khẩu - HOMS System",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #44624A;">Đặt lại mật khẩu HOMS</h2>
          <p>Xin chào,</p>
          <p>Bạn đã yêu cầu đặt lại mật khẩu. Mã OTP của bạn là:</p>
          <div style="background-color: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0;">
            <h1 style="color: #44624A; letter-spacing: 5px; margin: 0;">${otp}</h1>
          </div>
          <p>Mã có hiệu lực trong <b>1 phút</b>.</p>
          <p style="color: #999; font-size: 12px;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
        </div>
      `,
    });

    console.log(`✅ OTP email sent to ${user.email}`);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw new AppError("Không thể gửi email. Vui lòng kiểm tra cấu hình email.", 500);
  }

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
exports.verifyOTP = async ({ email, otp }) => {
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

  // Đánh dấu OTP đã được verify (giữ lại để dùng cho reset password)
  user.otpVerified = true;
  await user.save();

  return true;
};

exports.resetPasswordWithEmail = async ({ email, newPassword }) => {
  const user = await User.findOne({
    email,
    otpVerified: true,
  });

  if (!user) {
    throw new AppError("Vui lòng xác thực OTP trước khi đặt lại mật khẩu", 400);
  }

  // Hash password mới
  const hashedPassword = await bcrypt.hash(newPassword, 12);

  user.password = hashedPassword;
  user.otpResetPassword = undefined;
  user.otpResetExpires = undefined;
  user.otpVerified = undefined;

  await user.save();

  return true;
};


const storeRefreshToken = async (user, refreshToken) => {
  const hashed = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  user.refreshTokens.push({
    token: hashed,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await user.save();
};
