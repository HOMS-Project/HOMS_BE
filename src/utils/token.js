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

/** Standard 7-day refresh token — used by the web dashboard */
const generateRefreshToken = (user) => {
    return jwt.sign(
        { userId: user._id }, 
        process.env.REFRESH_TOKEN_SECRET, 
        { expiresIn: '7d' }
    );
};

/**
 * Long-lived 7-day refresh token — used ONLY by the mobile driver app.
 * The longer expiry keeps drivers logged in between shifts without
 * affecting the shorter-lived web session tokens.
 */
const generateMobileRefreshToken = (user) => {
    return jwt.sign(
        { userId: user._id, client: 'mobile' },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
    );
};

module.exports = { generateToken, generateRefreshToken, generateMobileRefreshToken };