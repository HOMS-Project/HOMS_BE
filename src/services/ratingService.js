const ServiceRating = require('../models/ServiceRating');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');

/* ───────────────────────────────────────── */
const recalcAverages = async ({ driverId, vehicleId }) => {
  if (driverId) {
    const agg = await ServiceRating.aggregate([
      { $match: { driverId } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          avgClean: { $avg: '$categories.cleanliness' },
          avgProf: { $avg: '$categories.professionalism' },
          avgPunctual: { $avg: '$categories.punctuality' },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    if (agg.length > 0) {
      await User.findByIdAndUpdate(driverId, {
        $set: {
          'ratingStats.average': parseFloat(agg[0].avgRating.toFixed(2)),
          'ratingStats.cleanliness': parseFloat(agg[0].avgClean?.toFixed(2) || 0),
          'ratingStats.professionalism': parseFloat(agg[0].avgProf?.toFixed(2) || 0),
          'ratingStats.punctuality': parseFloat(agg[0].avgPunctual?.toFixed(2) || 0),
          'ratingStats.totalRatings': agg[0].totalCount,
        },
      });
    }
  }

  if (vehicleId) {
    const aggV = await ServiceRating.aggregate([
      { $match: { vehicleId } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    if (aggV.length > 0) {
      await Vehicle.findByIdAndUpdate(vehicleId, {
        $set: {
          'ratingStats.average': parseFloat(aggV[0].avgRating.toFixed(2)),
          'ratingStats.totalRatings': aggV[0].totalCount,
        },
      });
    }
  }
};

/* ───────────────────────────────────────── */
const createRating = async (user, payload) => {
  const customerId = user.userId || user.id;
  const {
    invoiceId,
    driverId,
    vehicleId,
    rating,
    categories,
    comment,
    images,
    quickTags,
  } = payload;

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error("NOT_FOUND");

  if (invoice.customerId.toString() !== customerId.toString()) {
    throw new Error("FORBIDDEN");
  }

  if (invoice.status !== "COMPLETED") {
    throw new Error("NOT_COMPLETED");
  }

  if (invoice.paymentStatus !== "PAID") {
    throw new Error("NOT_PAID");
  }

  if (invoice.isRated) {
    throw new Error("ALREADY_RATED");
  }

  const newRating = await ServiceRating.create({
    invoiceId,
    customerId,
    driverId: driverId || undefined,
    vehicleId: vehicleId || undefined,
    rating,
    categories: {
      cleanliness: categories?.cleanliness || undefined,
      professionalism: categories?.professionalism || undefined,
      punctuality: categories?.punctuality || undefined,
    },
    comment,
    images: images || [],
    quickTags: quickTags || [],
  });

  await Invoice.findByIdAndUpdate(invoiceId, {
    $set: { isRated: true },
  });

  recalcAverages({
    driverId: driverId || null,
    vehicleId: vehicleId || null,
  }).catch(console.error);

  return newRating;
};

/* ───────────────────────────────────────── */
const getRatingByInvoice = async (invoiceId) => {
  const rating = await ServiceRating.findOne({ invoiceId })
    .populate('driverId', 'fullName avatar')
    .populate('vehicleId', 'licensePlate type');

  if (!rating) throw new Error("NOT_FOUND");

  return rating;
};

/* ───────────────────────────────────────── */
const getRatingsByDriver = async (driverId, page = 1, limit = 10) => {
  const [ratings, total] = await Promise.all([
    ServiceRating.find({ driverId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('customerId', 'fullName avatar')
      .populate('invoiceId', 'code'),
    ServiceRating.countDocuments({ driverId }),
  ]);

  return {
    ratings,
    pagination: { total, page: Number(page), limit: Number(limit) },
  };
};

/* ───────────────────────────────────────── */
const getPublicRatings = async (limit = 10) => {
  const ratings = await ServiceRating.find({ rating: { $gte: 4 } })
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate('customerId', 'fullName avatar');
  return ratings;
};

module.exports = {
  createRating,
  getRatingByInvoice,
  getRatingsByDriver,
  getPublicRatings,
};