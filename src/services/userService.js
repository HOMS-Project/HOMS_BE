const User = require("../models/User");
const AppError = require("../utils/appErrors");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadAvatarToCloudinary = (fileBuffer, originalName) => {
  return new Promise((resolve, reject) => {
    const safeName = (originalName || "avatar").replace(/\s+/g, "_");
    const publicId = `avatars/${Date.now()}_${safeName}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "image",
        folder: "avatars",
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      },
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

// Lấy thông tin người dùng
exports.getUserInfo = async (userId) => {
  const user = await User.findById(userId).select(
    "-password -otpResetPassword -otpResetExpires",
  );

  if (!user) {
    throw new AppError("Không tìm thấy người dùng", 404);
  }

  return user;
};

// Cập nhật thông tin người dùng
exports.updateUserInfo = async (userId, updateData) => {
  // We intentionally find the user, assign allowed fields, then save.
  // This handles validation hooks and works whether updateData comes from
  // JSON body or multipart/form-data (multer).
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("Không tìm thấy người dùng", 404);
  }

  // Whitelist updatable fields
  // include address so profile updates can persist user's address
  const allowed = ["fullName", "phone", "address"];
  let changed = false;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updateData, key)) {
      // assign only if value is not undefined
      const val = updateData[key];
      if (typeof val !== "undefined" && val !== null) {
        user[key] = val;
        changed = true;
      }
    }
  }

  if (!changed) {
    // Nothing to update, simply return current user (without sensitive fields)
    return user.toObject({
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.otpResetPassword;
        delete ret.otpResetExpires;
        return ret;
      },
    });
  }

  await user.save();

  // Re-fetch the user from DB to ensure we return the persisted, up-to-date document
  const updated = await User.findById(userId).select(
    "-password -otpResetPassword -otpResetExpires",
  );
  if (!updated)
    throw new AppError("Không tìm thấy người dùng sau khi cập nhật", 500);
  return updated;
};

// Thay đổi mật khẩu
exports.changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("Không tìm thấy người dùng", 404);
  }

  if (!currentPassword || !newPassword) {
    throw new AppError("Thiếu mật khẩu hiện tại hoặc mật khẩu mới", 400);
  }

  if (!user.password) {
    throw new AppError(
      "Tài khoản này không có mật khẩu (đăng nhập Google). Vui lòng đặt mật khẩu bằng chức năng đặt lại mật khẩu.",
      400,
    );
  }

  // So khớp mật khẩu hiện tại
  const isMatch = await bcrypt.compare(currentPassword, user.password);

  if (!isMatch) {
    throw new AppError("Mật khẩu hiện tại không đúng", 401);
  }

  // Hash mật khẩu mới
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  user.password = hashedPassword;

  await user.save();

  return { message: "Đổi mật khẩu thành công" };
};

// Lấy danh sách nhân viên khảo sát
exports.getDispatchers = async () => {
  const dispatchers = await User.find({
    role: "dispatcher",
    status: "Active",
  }).select("-password -otpResetPassword -otpResetExpires");
  return dispatchers;
};

// Lấy danh sách tài xế
exports.getDrivers = async () => {
  return await User.find({ role: "driver", status: "Active" }).select(
    "-password -otpResetPassword -otpResetExpires",
  );
};

// Lấy danh sách nhân viên bốc xếp (staff). Hệ thống hiện tại có thể chỉ dùng 'driver' cho bốc xếp, nhưng ta cứ map vào 'driver' tạm.
exports.getStaff = async () => {
  return await User.find({ role: "driver", status: "Active" }).select(
    "-password -otpResetPassword -otpResetExpires",
  );
};

exports.updateAvatar = async (userId, file) => {
  if (!file || !file.buffer) {
    throw new AppError("Vui lòng chọn ảnh đại diện hợp lệ", 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("Không tìm thấy người dùng", 404);
  }

  const avatarUrl = await uploadAvatarToCloudinary(
    file.buffer,
    file.originalname,
  );
  user.avatar = avatarUrl;
  await user.save();

  const updated = await User.findById(userId).select(
    "-password -otpResetPassword -otpResetExpires",
  );

  if (!updated) {
    throw new AppError(
      "Không tìm thấy người dùng sau khi cập nhật avatar",
      500,
    );
  }

  return updated;
};

exports.logoutAllSessions = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { refreshTokens: [] } },
    { new: true },
  );

  if (!user) {
    throw new AppError("Không tìm thấy người dùng", 404);
  }

  return { message: "Đã đăng xuất khỏi tất cả phiên đăng nhập" };
};
