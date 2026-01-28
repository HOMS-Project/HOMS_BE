const userService = require('../services/userService');

// Lấy thông tin người dùng
exports.getUserInfo = async (req, res, next) => {
    try {
        const userId = req.user._id || req.user.id;
        const user = await userService.getUserInfo(userId);

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

// Cập nhật thông tin người dùng
exports.updateUserInfo = async (req, res, next) => {
    try {
        const userId = req.user._id || req.user.id;
        const updateData = req.body;

        const user = await userService.updateUserInfo(userId, updateData);

        res.status(200).json({
            success: true,
            message: 'Cập nhật thông tin thành công',
            data: user
        });
    } catch (error) {
        next(error);
    }
};

// Thay đổi mật khẩu
exports.changePassword = async (req, res, next) => {
    try {
        const userId = req.user._id || req.user.id;
        const { currentPassword, newPassword } = req.body;

        const result = await userService.changePassword(userId, {
            currentPassword,
            newPassword
        });

        res.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        next(error);
    }
};
