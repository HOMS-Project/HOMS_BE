const User = require('../../models/User');
const bcrypt = require('bcryptjs');

/**
 * Lấy danh sách users (có phân trang và filter)
 */
exports.getAllUsers = async (query) => {
    const { page = 1, limit = 10, role, status, search } = query;

    let filter = {};
    if (role) filter.role = role.toLowerCase();
    if (status) filter.status = status;

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
