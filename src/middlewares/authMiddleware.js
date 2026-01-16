const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const timeStamp = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < timeStamp) {
            return res.status(401).json({ message: 'Token expired' });
        }
        req.user = { id: decoded.id, role: decoded.role, name: decoded.name };
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token has expired' });
        } else if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token' });
        } else {
            console.error('Token verification error:', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
}

module.exports = authMiddleware;
