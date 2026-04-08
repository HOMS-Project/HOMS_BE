const ratingService = require('../services/ratingService');

/* ─────────────────────────────────────────────────────────
   Helper: Tính và cập nhật average rating cho driver / vehicle
───────────────────────────────────────────────────────── */


/* ─────────────────────────────────────────────────────────
   POST /api/service-ratings
   Body: { invoiceId, driverId?, vehicleId?, rating, categories?, comment?, images?, quickTags? }
   Middleware: verifyToken, validateRating
───────────────────────────────────────────────────────── */
const createRating = async (req, res) => {
  try {
    const data = await ratingService.createRating(req.user, req.body);

    return res.status(201).json({
      success: true,
      message: "Cảm ơn bạn đã đánh giá dịch vụ!",
      data,
    });

  } catch (err) {
    console.error('[createRating]', err);

    const map = {
      NOT_FOUND: [404, "Không tìm thấy hóa đơn"],
      FORBIDDEN: [403, "Bạn không có quyền"],
      NOT_COMPLETED: [400, "Đơn chưa hoàn thành"],
      NOT_PAID: [400, "Chưa thanh toán đủ"],
      ALREADY_RATED: [400, "Đã đánh giá rồi"],
    };

    const [status, message] = map[err.message] || [500, "Lỗi server"];

    return res.status(status).json({
      success: false,
      message,
    });
  }
};


/* ─────────────────────────────────────────────────────────
   GET /api/service-ratings/invoice/:invoiceId
   Lấy rating của một Invoice (để hiển thị lại cho khách)
───────────────────────────────────────────────────────── */
const getRatingByInvoice = async (req, res) => {
  try {
    const data = await ratingService.getRatingByInvoice(req.params.invoiceId);

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(404).json({
      success: false,
      message: "Chưa có đánh giá",
    });
  }
};

/* ─────────────────────────────────────────────────────────
   GET /api/service-ratings/driver/:driverId
   Lấy tất cả rating của một tài xế (dùng cho admin / profile)
───────────────────────────────────────────────────────── */
const getRatingsByDriver = async (req, res) => {
  try {
    const { page, limit } = req.query;

    const result = await ratingService.getRatingsByDriver(
      req.params.driverId,
      page,
      limit
    );

    return res.json({
      success: true,
      data: result.ratings,
      pagination: result.pagination,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

/* ─────────────────────────────────────────────────────────
   GET /api/public/ratings
   Lấy rating tốt để hiển thị trên Landing Page
───────────────────────────────────────────────────────── */
const getPublicRatings = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const data = await ratingService.getPublicRatings(limit);

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Lỗi server",
    });
  }
};

module.exports = { createRating, getRatingByInvoice, getRatingsByDriver, getPublicRatings };