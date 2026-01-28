const User = require('../models/User');
const AppError = require('../utils/appErrors');
const bcrypt = require('bcryptjs');

// Lấy thông tin người dùng
exports.getUserInfo = async (userId) => {
    const user = await User.findById(userId).select('-password -otpResetPassword -otpResetExpires');

    if (!user) {
        throw new AppError('Không tìm thấy người dùng', 404);
    }

    return user;
};

// Cập nhật thông tin người dùng
exports.updateUserInfo = async (userId, updateData) => {
    const user = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
        runValidators: true
    }).select('-password -otpResetPassword -otpResetExpires');

    if (!user) {
        throw new AppError('Không tìm thấy người dùng', 404);
    }

    return user;
};

// Thay đổi mật khẩu
exports.changePassword = async (userId, { currentPassword, newPassword }) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new AppError('Không tìm thấy người dùng', 404);
    }

    // So khớp mật khẩu hiện tại
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
        throw new AppError('Mật khẩu hiện tại không đúng', 401);
    }

    // Hash mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    user.password = hashedPassword;

    await user.save();

    return { message: 'Đổi mật khẩu thành công' };
};
