const ServiceRating = require('../models/ServiceRating');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');

/* ─────────────────────────────────────────────────────────
   Helper: Tính và cập nhật average rating cho driver / vehicle
───────────────────────────────────────────────────────── */
const recalcAverages = async ({ driverId, vehicleId }) => {
  // Average cho driver
  if (driverId) {
    const agg = await ServiceRating.aggregate([
      { $match: { driverId: driverId } },
      {
        $group: {
          _id: null,
          avgRating:    { $avg: '$rating' },
          avgClean:     { $avg: '$categories.cleanliness' },
          avgProf:      { $avg: '$categories.professionalism' },
          avgPunctual:  { $avg: '$categories.punctuality' },
          totalCount:   { $sum: 1 },
        },
      },
    ]);
    if (agg.length > 0) {
      await User.findByIdAndUpdate(driverId, {
        $set: {
          'ratingStats.average':       parseFloat(agg[0].avgRating.toFixed(2)),
          'ratingStats.cleanliness':   parseFloat(agg[0].avgClean?.toFixed(2) || 0),
          'ratingStats.professionalism': parseFloat(agg[0].avgProf?.toFixed(2) || 0),
          'ratingStats.punctuality':   parseFloat(agg[0].avgPunctual?.toFixed(2) || 0),
          'ratingStats.totalRatings':  agg[0].totalCount,
        },
      });
    }
  }

  // Average cho vehicle
  if (vehicleId) {
    const aggV = await ServiceRating.aggregate([
      { $match: { vehicleId: vehicleId } },
      {
        $group: {
          _id: null,
          avgRating:   { $avg: '$rating' },
          totalCount:  { $sum: 1 },
        },
      },
    ]);
    if (aggV.length > 0) {
      await Vehicle.findByIdAndUpdate(vehicleId, {
        $set: {
          'ratingStats.average':      parseFloat(aggV[0].avgRating.toFixed(2)),
          'ratingStats.totalRatings': aggV[0].totalCount,
        },
      });
    }
  }
};

/* ─────────────────────────────────────────────────────────
   POST /api/service-ratings
   Body: { invoiceId, driverId?, vehicleId?, rating, categories?, comment?, images?, quickTags? }
   Middleware: verifyToken, validateRating
───────────────────────────────────────────────────────── */
const createRating = async (req, res) => {
  try {
    const customerId = req.user.userId || req.user.id;
    const {
      invoiceId,
      driverId,
      vehicleId,
      rating,
      categories,
      comment,
      images,
      quickTags,
    } = req.body;

    // Tạo bản ghi rating
    const newRating = await ServiceRating.create({
      invoiceId,
      customerId,
      driverId:  driverId  || undefined,
      vehicleId: vehicleId || undefined,
      rating,
      categories: {
        cleanliness:     categories?.cleanliness     || undefined,
        professionalism: categories?.professionalism || undefined,
        punctuality:     categories?.punctuality     || undefined,
      },
      comment,
      images:    images    || [],
      quickTags: quickTags || [],
    });

    // Post-save: Đánh dấu Invoice đã được đánh giá
    await Invoice.findByIdAndUpdate(invoiceId, { $set: { isRated: true } });

    // Tính lại averages (async, không block response)
    recalcAverages({
      driverId:  driverId  ? driverId  : null,
      vehicleId: vehicleId ? vehicleId : null,
    }).catch((err) => console.error('[recalcAverages]', err));

    return res.status(201).json({
      success: true,
      message: 'Cảm ơn bạn đã đánh giá dịch vụ!',
      data: newRating,
    });
  } catch (err) {
    console.error('[createRating]', err);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lưu đánh giá.',
    });
  }
};

/* ─────────────────────────────────────────────────────────
   GET /api/service-ratings/invoice/:invoiceId
   Lấy rating của một Invoice (để hiển thị lại cho khách)
───────────────────────────────────────────────────────── */
const getRatingByInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const rating = await ServiceRating.findOne({ invoiceId })
      .populate('driverId', 'fullName avatar')
      .populate('vehicleId', 'licensePlate type');

    if (!rating) {
      return res.status(404).json({ success: false, message: 'Chưa có đánh giá.' });
    }

    return res.json({ success: true, data: rating });
  } catch (err) {
    console.error('[getRatingByInvoice]', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

/* ─────────────────────────────────────────────────────────
   GET /api/service-ratings/driver/:driverId
   Lấy tất cả rating của một tài xế (dùng cho admin / profile)
───────────────────────────────────────────────────────── */
const getRatingsByDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const [ratings, total] = await Promise.all([
      ServiceRating.find({ driverId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('customerId', 'fullName avatar')
        .populate('invoiceId', 'code'),
      ServiceRating.countDocuments({ driverId }),
    ]);

    return res.json({
      success: true,
      data: ratings,
      pagination: { total, page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    console.error('[getRatingsByDriver]', err);
    return res.status(500).json({ success: false, message: 'Lỗi server.' });
  }
};

module.exports = { createRating, getRatingByInvoice, getRatingsByDriver };