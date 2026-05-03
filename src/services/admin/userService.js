const User = require('../../models/User');
const bcrypt = require('bcryptjs');
const AuditLog = require('../../models/AuditLog');
const NotificationService = require('../../services/notificationService');
const T = require('../../utils/notificationTemplates');

/**
 * Lấy danh sách users (có phân trang và filter)
 */
exports.getAllUsers = async (query) => {
    const { page = 1, limit = 10, role, status, search } = query;

    let filter = {};
    if (role) {
        // Keep role filter exact. Frontend/tab logic should decide when to request
        // a non-customer "staff" view (by omitting role and filtering client-side).
        filter.role = String(role).toLowerCase();
    }
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
    // Expected incoming fields: fullName, email, phone (or phoneNumber from FE), role, password (optional)
    const { email, phone, password, role, fullName } = userData;

    // Only allow admin to create staff accounts of these roles
    const allowedRoles = ['dispatcher', 'driver', 'staff'];
    const normalizedRole = role ? String(role).toLowerCase() : null;
    if (!normalizedRole || !allowedRoles.includes(normalizedRole)) {
        throw new Error('Invalid role. Allowed roles: dispatcher, driver, staff');
    }

    // Kiểm tra email hoặc phone đã tồn tại chưa
    const existingUser = await User.findOne({
        $or: [{ email: email || null }, { phone: phone || null }]
    });

    if (existingUser) {
        throw new Error('Email or phone already exists');
    }

    // Use default password if not provided by FE
    const plainPassword = password || 'User123@';

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);

    const newUser = new User({
        fullName,
        email: email || null,
        phone: phone || null,
        password: hashedPassword,
        provider: 'local',
        role: normalizedRole
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
    // Don't allow admin API to edit customer accounts
    const existingUser = await User.findById(id);
    if (!existingUser) {
        throw new Error('User not found');
    }
    if ((existingUser.role || '').toString().toLowerCase() === 'customer') {
        // Forbidden: admins should not be able to modify customer accounts via this endpoint
        throw new Error('Cannot edit customer users');
    }

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
            ...T.USER_BANNED({ reason })
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
            ...T.USER_UNBANNED()
        });
    } catch (err) {
        console.error('Failed to create unban notification', err.message || err);
    }

    const response = user.toObject();
    delete response.refreshTokens;
    delete response.password;
    return response;
};
