const jwt = require('jsonwebtoken');

const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role, name: user.name }, // Payload
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

const generateRefreshToken = (user) => {
    return jwt.sign(
        { userId: user._id }, 
        process.env.REFRESH_TOKEN_SECRET, 
        { expiresIn: '7d' }
    );
};

module.exports = { generateToken, generateRefreshToken };