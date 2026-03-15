const jwt = require('jsonwebtoken');

const generateToken = (user) => {
    const payload = { 
        userId: user._id, 
        role: user.role,
        fullName: user.fullName,
        workingAreas: user.dispatcherProfile?.workingAreas || [],
        isGeneral: user.dispatcherProfile?.isGeneral || false
    };

    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
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