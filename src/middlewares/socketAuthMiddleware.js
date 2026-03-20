const jwt = require('jsonwebtoken');

const socketAuthMiddleware = (socket, next) => {
    try {
        // Support token passed via socket auth or headers
        let token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
        
        if (!token) {
            return next(new Error('Authentication error: Missing token'));
        }

        // Remove typical Bearer prefix if present
        if (token.startsWith('Bearer ')) {
            token = token.slice(7, token.length);
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded; // Contains id, role, email, etc. generated from User login
        next();
    } catch (error) {
        console.error('Socket authentication error:', error.message);
        return next(new Error('Authentication error: Invalid token'));
    }
};

module.exports = socketAuthMiddleware;
