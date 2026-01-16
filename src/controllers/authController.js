const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.CLIENT_ID);

const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

const generateRefreshToken = (user) => {
  return jwt.sign({ userId: user._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};

exports.register = async (req, res) => {
    try {
        const { fullName, email, password, phone, role } = req.body;
        const existingUser = await User.findOne({ $or: [ { email }, { phone } ] });
        if (existingUser) {
            return res.status(400).json({ message: 'Email hoặc số điện thoại đã được sử dụng' });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new User({
            fullName,
            email,
            password: hashedPassword,
            phone,
            role
        });
        await newUser.save();
        const token = generateToken(newUser);
        const refreshToken = generateRefreshToken(newUser);
        res.status(201).json({ message: 'User registered successfully', token, refreshToken });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }   
}

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Email hoặc mật khẩu không đúng' });
        }
        const token = generateToken(user);
        const refreshToken = generateRefreshToken(user);
        res.json({ token, refreshToken });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
}