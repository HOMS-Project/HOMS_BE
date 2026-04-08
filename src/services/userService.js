const User = require("../models/User");
const AppError = require("../utils/appErrors");
const bcrypt = require("bcryptjs");

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
  const allowed = ['fullName', 'phone'];
  let changed = false;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updateData, key)) {
      // assign only if value is not undefined
      const val = updateData[key];
      if (typeof val !== 'undefined' && val !== null) {
        user[key] = val;
        changed = true;
      }
    }
  }

  if (!changed) {
    // Nothing to update, simply return current user (without sensitive fields)
    return user.toObject({ transform: (doc, ret) => { delete ret.password; delete ret.otpResetPassword; delete ret.otpResetExpires; return ret; } });
  }

  await user.save();

  // Return user without sensitive fields
  const result = user.toObject();
  delete result.password;
  delete result.otpResetPassword;
  delete result.otpResetExpires;
  return result;
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

// Note: avatar upload/update functionality removed per request.
// If you later want to re-enable avatar updates, re-implement an updateAvatar(userId, avatarUrl) function here.
