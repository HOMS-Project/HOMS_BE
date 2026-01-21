const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateToken, generateRefreshToken } = require('../utils/token');
const AppError = require('../utils/appErrors'); // Đảm bảo tên file khớp với thực tế (có 's' hay không)

// Hàm đăng ký
exports.registerUser = async ({ fullName, email, password, phone, role }) => {
    // Check trùng cả Email lẫn Phone
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
        // Sửa lại message cho chính xác hơn vì có thể trùng phone
        throw new AppError('Email hoặc số điện thoại đã tồn tại', 400); 
    }

    // 2. Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // 3. Tạo user mới
    const newUser = new User({
        fullName,
        email,
        password: hashedPassword,
        phone,
        role
    });

    // 4. Lưu vào DB
    await newUser.save();

    // 5. Sinh token
    const token = generateToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    return { newUser, token, refreshToken };
};

// Hàm đăng nhập
exports.loginUser = async ({ email, password }) => {
    // 1. Tìm user
    const user = await User.findOne({ email });
    
    // --- SỬA LỖI Ở ĐÂY ---
    // Phải dùng AppError và mã 401 (Unauthorized) hoặc 400
    if (!user) {
        throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }

    // 2. So khớp mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    
    // --- SỬA LỖI Ở ĐÂY ---
    if (!isMatch) {
        throw new AppError('Email hoặc mật khẩu không đúng', 401);
    }

    // 3. Sinh token
    const token = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    return { user, token, refreshToken };
};