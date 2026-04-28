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
const axios = require("axios");
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
exports.setupMagicAccount = async ({ token, password, phone }) => {

  try {
 const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SECRET');
      if (decoded.type !== 'setup_account') {
      throw new Error('Token không đúng mục đích.');
    }

    const tempUser = await User.findById(decoded.id);
    if (!tempUser) throw new Error('Không tìm thấy tài khoản.');

    if (!tempUser.securityToken || decoded.st !== tempUser.securityToken) {
      throw new Error('Link này đã được sử dụng hoặc không hợp lệ. Vui lòng đăng nhập.');
    }
     if (phone && phone !== tempUser.phone) {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        throw new Error('Số điện thoại này đã được gắn với một tài khoản khác. Vui lòng dùng số khác.');
      }
      tempUser.phone = phone;
    }
    const salt = await bcrypt.genSalt(10);
    tempUser.password = await bcrypt.hash(password, salt);
    tempUser.phone = phone; 
    tempUser.provider = 'local';
    tempUser.status = 'Active';

    tempUser.securityToken = crypto.randomBytes(16).toString('hex');
    
    await tempUser.save();


    const accessToken = generateToken(tempUser);
    const refreshToken = generateRefreshToken(tempUser);
    await storeRefreshToken(tempUser, refreshToken);

    const decodedToken = jwt.decode(accessToken);
    const expiresInMs = (decodedToken.exp - decodedToken.iat) * 1000;

    return {
      accessToken,
      refreshToken,
      expiresInMs,
      user: {
        id: tempUser._id,
        fullName: tempUser.fullName,
        email: tempUser.email,
        phone: tempUser.phone,
        role: tempUser.role,
        avatar: tempUser.avatar,
      }
    };
  } catch (error) {
    console.error("LỖI SETUP MAGIC:", error);
   if (error.name === 'TokenExpiredError') {
      throw new Error('Link đã hết hạn. Vui lòng đăng nhập hoặc yêu cầu link mới.');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Link không hợp lệ hoặc đã bị thay đổi.');
    }
      throw new Error(error.message || 'Lỗi xử lý server');
  }
};
exports.facebookLogin = async ({ accessToken }) => {
  if (!accessToken) {
    throw new AppError("No Facebook token provided", 400);
  }

  // 1. Gọi Graph API của Facebook để xác thực token và lấy thông tin user
  let fbData;
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${accessToken}`
    );
    fbData = data;
  } catch (error) {
    throw new AppError("Invalid Facebook token", 401);
  }

  const { id: fbAppId, name, email } = fbData;
  const avatar = fbData.picture?.data?.url;

  // 2. Tìm user theo facebookId (App-Scoped ID)
  let user = await User.findOne({ facebookId: fbAppId });

  if (!user && email) {
    // 3. TÍNH NĂNG LIÊN KẾT: Nếu chưa có facebookId nhưng có Email trùng khớp
    user = await User.findOne({ email });
    if (user) {
      // Liên kết tài khoản: Gắn thêm facebookId và đổi provider
      user.facebookId = fbAppId;
       if (user.status === 'Pending_Password') {
        user.status = 'Active';
      }
      if (!user.provider.includes('facebook')) {
        user.provider = user.provider === 'local' ? 'local_and_facebook' : 'facebook';
      }
      
      if (!user.avatar) user.avatar = avatar; // Cập nhật avatar nếu chưa có
      await user.save();
    }
  }

  // 4. Nếu vẫn không tìm thấy, tạo tài khoản mới hoàn toàn
  if (!user) {
    user = await User.create({
      fullName: name || "Facebook User",
      email: email || undefined, // FB có thể không trả về email nếu user đăng ký bằng SĐT
      facebookId: fbAppId,
      provider: "facebook",
      status: "Active",
      role: "customer",
      avatar: avatar,
    });
  } else {
    // Check status block
    const status = (user.status || "").toString().toLowerCase();
    if (status !== "active" && status !== "pending_password") {
      throw new AppError("Tài khoản của bạn đã bị khóa hoặc không hoạt động.", 403);
    }
  }

  // 5. Sinh JWT Token cho hệ thống của mình
  const systemAccessToken = generateToken(user);
  const refreshToken = generateRefreshToken(user);
  const decoded = jwt.decode(systemAccessToken);
  const expiresInMs = (decoded.exp - decoded.iat) * 1000;
  
  await storeRefreshToken(user, refreshToken);

  return {
    accessToken: systemAccessToken,
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
exports.linkMessengerAccountService = async (userId, userEmail, linkToken) => {
  if (!linkToken) {
    throw new AppError("Thiếu token liên kết", 400);
  }

  try {
    // 1. Giải mã token
    const decoded = jwt.verify(linkToken, process.env.JWT_SECRET);

    // 2. Kiểm tra intent
    if (decoded.intent !== 'link_messenger') {
      throw new AppError("Token không hợp lệ", 400);
    }

    // 3. Check email
    if (decoded.email !== userEmail) {
      throw new AppError(
        "Token liên kết không thuộc về tài khoản này. Hành động bị từ chối!",
        403
      );
    }

    // 4. Update DB
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { messengerId: decoded.linkMessengerId },
      { new: true }
    );

    if (!updatedUser) {
      throw new AppError("Không tìm thấy tài khoản người dùng", 404);
    }

    return updatedUser;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new AppError(
        "Link liên kết Messenger đã hết hạn (quá 15 phút). Vui lòng thao tác lại trên Messenger.",
        400
      );
    }
    throw error;
  }
};