const Invoice = require('../models/Invoice');
const ServiceRating = require('../models/ServiceRating');

/**
 * Validator Middleware: Kiểm tra điều kiện trước khi lưu ServiceRating
 * 1. invoiceId phải tồn tại và có status COMPLETED
 * 2. customerId gửi request phải trùng với chủ Invoice
 * 3. Invoice chưa từng được đánh giá (isRated === false)
 */
const validateRating = async (req, res, next) => {
  try {
    const { invoiceId } = req.body;
    const requesterId = req.user?.userId || req.user?.id;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: 'invoiceId là bắt buộc.',
      });
    }

    // 1. Tìm Invoice
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy hóa đơn.',
      });
    }

    // 2. Kiểm tra trạng thái COMPLETED
    if (invoice.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Chỉ có thể đánh giá đơn hàng đã hoàn thành.',
      });
    }

    // 3. Kiểm tra quyền sở hữu — customerId lấy từ RequestTicket liên kết
    
    const customerId = req.user?.userId;
    if (customerId && customerId  !== requesterId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền đánh giá đơn hàng này.',
      });
    }

    // 4. Kiểm tra chưa được đánh giá
    if (invoice.isRated) {
      return res.status(409).json({
        success: false,
        message: 'Đơn hàng này đã được đánh giá trước đó.',
      });
    }

    // Attach invoice vào request để controller dùng lại
    req.invoice = invoice;
    next();
  } catch (err) {
    console.error('[validateRating]', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi kiểm tra điều kiện đánh giá.',
    });
  }
};

module.exports = { validateRating };