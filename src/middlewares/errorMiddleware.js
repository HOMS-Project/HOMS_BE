const errorMiddleware = (err, req, res, next) => {
    console.error(err.stack); 
      if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ 
      message: 'Invalid or missing CSRF token' 
    });
  }
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Lỗi hệ thống server';
    
    res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        data: err.data,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
};

module.exports = errorMiddleware;