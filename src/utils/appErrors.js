
class AppError extends Error {
  constructor(message, statusCode, data = null) {
    super(message); 
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    if (data) {
      this.data = data;
    }
   
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;