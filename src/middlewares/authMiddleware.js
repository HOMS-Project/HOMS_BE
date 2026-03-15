const jwt = require('jsonwebtoken');

// 1. Xác thực (Authentication)
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized: Thiếu token hoặc sai định dạng' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token has expired' });
        }
        return res.status(403).json({ message: 'Invalid token' });
    }
}

// 2. Phân quyền (Authorization) 
const authorize = (...roles) => {
  return (req, res, next) => {

    console.log("USER ROLE:", req.user?.role);
    console.log("ALLOWED:", roles);

    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userRole = req.user.role.toUpperCase();

    if (!roles.map(r => r.toUpperCase()).includes(userRole)) {
      return res.status(403).json({
        message: 'Forbidden: Bạn không có quyền truy cập'
      });
    }

    next();
  };
};

module.exports = { 
  verifyToken, 
  authenticate: verifyToken,  // Alias
  authorize 
};