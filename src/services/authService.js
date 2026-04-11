const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { generateToken, generateRefreshToken } = require("../utils/token");
const AppError = require("../utils/appErrors");
const { OAuth2Client } = require("google-auth-library");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const client = new OAuth2Client(process.env.CLIENT_ID);
const { sendOtp, verifyOtp } = require("./otpService");
// Lưu tạm thông tin đăng ký (có thể dùng Redis hoặc Collection riêng trong production)
const pendingRegistrations = new Map();

// Hàm gửi OTP khi đăng ký
exports.sendRegistrationOTP = async ({ fullName, email, password, phone }) => {
  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    throw new AppError("Email hoặc số điện thoại đã tồn tại", 400);
  }
  const hashedPassword = await bcrypt.hash(password, 12);

  // Lưu tạm thông tin đăng ký với OTP
  pendingRegistrations.set(email, {
    fullName,
    email,
    password: hashedPassword,
    phone,
  });
  await sendOtp("REGISTER", email, email, fullName);
  return true;
};

// Hàm verify OTP và tạo tài khoản
exports.verifyRegistrationOTP = async ({ email, otp }) => {
  const registration = pendingRegistrations.get(email);

  if (!registration) {
    throw new AppError(
      "Không tìm thấy thông tin đăng ký. Vui lòng đăng ký lại.",
      400,
    );
  }
  await verifyOtp("REGISTER", email, otp);

  const existingUser = await User.findOne({
    $or: [{ email: registration.email }, { phone: registration.phone }],
  });
  if (existingUser) {
    pendingRegistrations.delete(email);
    throw new AppError("Email hoặc số điện thoại đã tồn tại", 400);
  }

  // Tạo user mới
  const newUser = new User({
    fullName: registration.fullName,
    email: registration.email,
    password: registration.password,
    phone: registration.phone,
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
    throw new AppError("Email hoặc số điện thoại đã tồn tại", 400);
  }

  // 2. Hash password
  const hashedPassword = await bcrypt.hash(password, 12);

  // 3. Tạo user mới
  const newUser = new User({
    fullName,
    email,
    password: hashedPassword,
    phone,
  });

  // 4. Lưu vào DB
  await newUser.save();
  return newUser;
};

// Hàm đăng nhập
exports.loginUser = async ({ email, password }) => {
  // 1. Tìm user
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );

  // --- SỬA LỖI Ở ĐÂY ---
  if (!user) {
    throw new AppError("Email hoặc mật khẩu không đúng", 401);
  }
  if (!password || !user.password) {
    throw new AppError("Dữ liệu xác thực không hợp lệ", 401);
  }
  // 2. So khớp mật khẩu
  const isMatch = await bcrypt.compare(password, user.password);

  // --- SỬA LỖI Ở ĐÂY ---
  if (!isMatch) {
    throw new AppError("Email hoặc mật khẩu không đúng", 401);
  }

  // 2.5. Block login if user status is not Active
  // Normalize status and check
  const userStatus = (user.status || "").toString();
  if (userStatus.toLowerCase() !== "active") {
    // Provide a clear message for the client
    throw new AppError(
      "Tài khoản không được phép đăng nhập do tài khoản bị vô hiệu hóa",
      403,
    );
  }

  // 3. Sinh token
  const accessToken = generateToken(user);
  const refreshToken = generateRefreshToken(user);
  const decoded = jwt.decode(accessToken);
  const expiresInMs = (decoded.exp - decoded.iat) * 1000;
  await storeRefreshToken(user, refreshToken);

  return { user, accessToken, refreshToken, expiresInMs };
};

exports.refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new AppError("No refresh token provided", 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new AppError("Refresh token invalid or expired", 401);
  }

  const user = await User.findById(decoded.userId);
  if (!user) {
    throw new AppError("User not found", 401);
  }

  // Block refresh token usage for non-active accounts
  if ((user.status || "").toString().toLowerCase() !== "active") {
    throw new AppError(
      "Account is not active. Please contact administrator.",
      403,
    );
  }

  const hashedRefreshToken = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const tokenIndex = user.refreshTokens.findIndex(
    (t) => t.token === hashedRefreshToken,
  );

  if (tokenIndex === -1) {
    throw new AppError("Invalid refresh token", 401);
  }
  const tokenInDb = user.refreshTokens[tokenIndex];
  if (tokenInDb.expiresAt < new Date()) {
    user.refreshTokens.splice(tokenIndex, 1);
    await user.save();
    throw new AppError("Refresh token expired", 401);
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
    expiresInMs,
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
      fullName: name || "Google User",
      email,
      googleId: sub,
      provider: "google",
      status: "Active",
      verified: true,
      role: "customer",
      avatar: picture,
    });
  } else {
    const status = (user.status || "").toString().toLowerCase();
    if (status !== "active") {
      const err = new Error(
        "Tài khoản không được phép đăng nhập do trạng thái tài khoản không hoạt động",
      );
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
      createdAt: user.createdAt,
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

  await sendOtp("FORGOT_PASSWORD", email, email, user.fullName);
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
  await verifyOtp("FORGOT_PASSWORD", email, otp);

  const user = await User.findOne({ email });
  if (!user) throw new AppError("Không tìm thấy user", 404);
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
  const hashed = crypto.createHash("sha256").update(refreshToken).digest("hex");

  await User.findByIdAndUpdate(user._id, {
    $push: {
      refreshTokens: {
        token: hashed,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    },
  });
};
exports.logoutUser = async (refreshToken) => {
  if (!refreshToken) {
    throw new AppError("No refresh token provided", 400);
  }
  console.log("RefreshToken:", refreshToken);

  const hashed = crypto.createHash("sha256").update(refreshToken).digest("hex");
  console.log("Hashed:", hashed);
  await User.updateOne(
    { "refreshTokens.token": hashed },
    { $pull: { refreshTokens: { token: hashed } } },
  );

  return true;
};
