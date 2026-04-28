const jwt = require('jsonwebtoken');
const User = require('../models/User');

// 1. Xác thực (Authentication)
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: Thiếu token hoặc sai định dạng' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user object from DB to validate status and existence
    const userId = decoded.userId;
    const user = await User.findById(userId).select('-password -refreshTokens');
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized: user not found' });
    }

    // Block users whose status is not Active
    const status = (user.status || '').toString().toLowerCase();
    if (status !== 'active') {
      return res.status(403).json({ message: 'Account is not active. Please contact administrator.' });
    }

    // attach the user object to request for downstream handlers
    req.user = {
      _id: user._id,
      userId: user._id,
      role: user.role,
        email: user.email, 
      fullName: user.fullName,
      workingAreas: user.dispatcherProfile?.workingAreas || [],
      isGeneral: user.dispatcherProfile?.isGeneral || false
    };
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

    if (!req.user || !req.user.role) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const userRole = req.user.role.toUpperCase();
    const allowedRoles = roles.map(r => (typeof r === 'string' ? r.toUpperCase() : r));

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: `Forbidden: Role ${userRole} is not authorized`
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