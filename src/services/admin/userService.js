const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const AuditLog = require('../../models/AuditLog');
const NotificationService = require('../../services/notificationService');

/**
 * Lấy danh sách users (có phân trang và filter)
 */
exports.getAllUsers = async (query) => {
    const { page = 1, limit = 10, role, status, search } = query;

    let filter = {};
    if (role) filter.role = role.toLowerCase();
    if (status) {
        // Normalize status to match enum values in User model (e.g., 'active' -> 'Active')
        const s = String(status).toLowerCase();
        const map = { active: 'Active', inactive: 'Inactive', blocked: 'Blocked', banned: 'Banned' };
        filter.status = map[s] || status;
    }

    if (search) {
        filter.$or = [
            { fullName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } }
        ];
    }

    const users = await User.find(filter)
        .select('-password -refreshTokens') // Không trả về password và token
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

    const count = await User.countDocuments(filter);

    return {
        users,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalUsers: count
    };
};

/**
 * Lấy chi tiết 1 user
 */
exports.getUserById = async (id) => {
    const user = await User.findById(id).select('-password -refreshTokens');
    if (!user) {
        throw new Error('User not found');
    }
    return user;
};

/**
 * Admin tạo user mới (Đặc biệt cho nhân viên: dispatcher, driver, staff)
 */
exports.createUser = async (userData) => {
    const { email, phone, password, role, fullName } = userData;

    // Kiểm tra email hoặc phone đã tồn tại chưa
    const existingUser = await User.findOne({
        $or: [{ email: email || null }, { phone: phone || null }]
    });

    if (existingUser) {
        throw new Error('Email or phone already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
        ...userData,
        password: hashedPassword,
        provider: 'local',
        role: role.toLowerCase()
    });

    await newUser.save();

    const userResponse = newUser.toObject();
    delete userResponse.password;
    delete userResponse.refreshTokens;

    return userResponse;
};

/**
 * Admin cập nhật thông tin User
 */
exports.updateUser = async (id, updateData) => {
    // Nếu có update password từ admin
    if (updateData.password) {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(updateData.password, salt);
    }

    // Normalize status value if provided (allow FE to send lowercase)
    if (updateData.status) {
        const s = String(updateData.status).toLowerCase();
        const map = { active: 'Active', inactive: 'Inactive', blocked: 'Blocked', banned: 'Banned' };
        updateData.status = map[s] || updateData.status;
    }

    const updatedUser = await User.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    ).select('-password -refreshTokens');

    if (!updatedUser) {
        throw new Error('User not found');
    }

    return updatedUser;
};

/**
 * Xóa/Block user (Thường là đổi status thành Blocked hoặc Inactive chứ không xóa cứng)
 */
exports.deleteUser = async (id) => {
    const user = await User.findByIdAndUpdate(
        id,
        { status: 'Blocked' },
        { new: true }
    ).select('-password -refreshTokens');

    if (!user) {
        throw new Error('User not found');
    }
    return user;
};

/**
 * Ban a user (set status to 'Banned') and create audit & notification
 */
exports.banUser = async (id, { reason, performedBy } = {}) => {
    const user = await User.findById(id).select('-password -refreshTokens');
    if (!user) {
        throw new Error('User not found');
    }

    if (user.status === 'Banned') {
        throw new Error('User already banned');
    }

    user.status = 'Banned';
    await user.save();

    // Create audit log
    await AuditLog.create({
        action: 'BAN_USER',
        performedBy: performedBy || null,
        targetUser: user._id,
        details: reason || 'Banned by admin'
    });

    // Send notification to user (best-effort)
    try {
        await NotificationService.createNotification({
            userId: user._id,
            title: 'Tài khoản bị cấm',
            message: reason ? `Tài khoản của bạn đã bị cấm: ${reason}` : 'Tài khoản của bạn đã bị cấm bởi quản trị viên.',
            type: 'account'
        });
    } catch (err) {
        // don't block flow if notification fails
        console.error('Failed to create ban notification', err.message || err);
    }

    const response = user.toObject();
    delete response.refreshTokens;
    delete response.password;
    return response;
};

/**
 * Unban a user (set status to 'Active') and create audit & notification
 */
exports.unbanUser = async (id, { reason, performedBy } = {}) => {
    const user = await User.findById(id).select('-password -refreshTokens');
    if (!user) {
        throw new Error('User not found');
    }

    if (user.status !== 'Banned') {
        throw new Error('User is not banned');
    }

    user.status = 'Active';
    await user.save();

    // Create audit log
    await AuditLog.create({
        action: 'UNBAN_USER',
        performedBy: performedBy || null,
        targetUser: user._id,
        details: reason || 'Unbanned by admin'
    });

    // Send notification to user (best-effort)
    try {
        await NotificationService.createNotification({
            userId: user._id,
            title: 'Tài khoản đã được kích hoạt',
            message: 'Tài khoản của bạn đã được gỡ cấm và hoạt động trở lại.',
            type: 'account'
        });
    } catch (err) {
        console.error('Failed to create unban notification', err.message || err);
    }

    const response = user.toObject();
    delete response.refreshTokens;
    delete response.password;
    return response;
};