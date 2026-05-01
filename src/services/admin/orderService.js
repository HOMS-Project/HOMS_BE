const RequestTicket = require('../../models/RequestTicket');
const PricingData = require('../../models/PricingData');
const User = require('../../models/User');

/**
 * Get paginated request tickets for admin panel.
 * Supports filters: status, from,to (dates), search (code/customer phone/name)
 */
async function listOrders({ page = 1, limit = 20, status, from, to, search, source, summary = false } = {}) {
  const q = {};
  if (status) q.status = status;

  // source filter: fanpage orders are those created from AI BOT notes marker
  // use a RegExp object and match substring to be more robust
  const aiSubstr = 'TẠO TỪ AI BOT';
  const aiRegex = new RegExp(aiSubstr, 'i');
  if (source === 'FACEBOOK') {
    // ensure notes contain the ai substring (case-insensitive)
    q.notes = aiRegex;
  } else if (source === 'WEB') {
    // web: exclude AI-tagged notes
    q.notes = { $not: aiRegex };
  }

  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to);
  }

  if (search) {
    const s = search.trim();
    // search by code or phone or customer name (basic)
    q.$or = [
      { code: { $regex: s, $options: 'i' } },
      { 'pricing.promotion.code': { $regex: s, $options: 'i' } }
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  // if summary requested, return empty items (frontend should use metrics/charts)
  let items = [];
  let total = 0;
  if (!summary) {
    const results = await Promise.all([
      RequestTicket.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean()
        .exec(),
      RequestTicket.countDocuments(q)
    ]);
    items = results[0];
    total = results[1];
  } else {
    // only compute total for metrics/charts
    total = await RequestTicket.countDocuments(q);
  }

  // Attach pricing snapshot if available
  const pricingIds = items.map(i => i.pricing && i.pricing.pricingDataId).filter(Boolean);
  const pricingMap = {};
  if (pricingIds.length) {
    const pricing = await PricingData.find({ _id: { $in: pricingIds } }).lean();
    pricing.forEach(p => { pricingMap[p._id.toString()] = p; });
  }

  // Attach customer basic info and normalize totalPrice for frontend
  const customerIds = items.map(i => i.customerId).filter(Boolean).map(id => id.toString());
  const userMap = {};
  if (customerIds.length) {
    const users = await User.find({ _id: { $in: customerIds } }).lean();
    users.forEach(u => { userMap[u._id.toString()] = u; });
  }

  const normalized = items.map(i => {
    const pricingSnap = i.pricing && i.pricing.pricingDataId ? pricingMap[i.pricing.pricingDataId.toString()] || null : null;
    // pick totalPrice from the ticket's pricing snapshot, fallback to pricing.totalPrice on ticket
    const totalPrice = (i.pricing && typeof i.pricing.totalPrice === 'number') ? i.pricing.totalPrice : (pricingSnap && pricingSnap.totalPrice) ? pricingSnap.totalPrice : 0;
    const customer = i.customerId ? (userMap[i.customerId.toString()] || null) : null;
    return {
      ...i,
      pricingSnapshot: pricingSnap,
      totalPrice,
      customer: customer ? (customer.fullName || customer.email || customer.phone || '') : '',
      customerPhone: customer ? (customer.phone || '') : ''
    };
  });

  // Compute metrics across the full matched set (not limited by pagination)
  const agg = await RequestTicket.aggregate([
    { $match: q },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalValue: { $sum: { $ifNull: [ '$pricing.totalPrice', 0 ] } },
        converted: { $sum: { $cond: [ { $eq: [ '$status', 'CONVERTED' ] }, 1, 0 ] } }
      }
    }
  ]).exec();

  const metricsRaw = (agg && agg[0]) ? agg[0] : { totalOrders: 0, totalValue: 0, converted: 0 };
  const totalOrdersMetric = metricsRaw.totalOrders || 0;
  const totalValueMetric = metricsRaw.totalValue || 0;
  const convertedMetric = metricsRaw.converted || 0;
  const avgMetric = totalOrdersMetric ? Math.round(totalValueMetric / totalOrdersMetric) : 0;
  const conversionRateMetric = totalOrdersMetric ? Math.round((convertedMetric / totalOrdersMetric) * 100) : 0;

  const metrics = {
    totalOrders: totalOrdersMetric,
    totalValue: totalValueMetric,
    avg: avgMetric,
    converted: convertedMetric,
    conversionRate: conversionRateMetric
  };

  // Timeseries aggregation (group by day) and status distribution for charts
  const timeseriesAgg = await RequestTicket.aggregate([
    { $match: q },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        value: { $sum: { $ifNull: [ '$pricing.totalPrice', 0 ] } }
      }
    },
    { $sort: { '_id': 1 } }
  ]).exec();

  const timeseries = timeseriesAgg.map(t => ({ date: t._id, count: t.count, value: t.value }));

  const statusAgg = await RequestTicket.aggregate([
    { $match: q },
    { $group: { _id: '$status', value: { $sum: 1 }, notes: { $push: '$notes' } } },
    { $project: {
        _id: 0,
        name: '$_id',
        value: 1,
        // filter out null/empty notes and take up to 5 samples
        notes: { $slice: [ { $filter: { input: '$notes', as: 'n', cond: { $and: [ { $ne: ['$$n', null] }, { $ne: ['$$n', ''] } ] } } }, 5 ] }
    } }
  ]).exec();

  const statusDistribution = statusAgg.map(s => ({ name: s.name, value: s.value, notes: s.notes || [] }));

  const charts = { timeseries, statusDistribution };

  return { items: normalized, total, page: Number(page), limit: Number(limit), metrics, charts };
}

module.exports = {
  listOrders
};

/**
 * Get single request ticket with pricing snapshot and service type details
 */
async function getOrderById(id) {
  if (!id) throw new Error('Missing id');
  const rt = await RequestTicket.findById(id).lean().exec();
  if (!rt) throw new Error('Not found');

  // attach pricing snapshot if present
  let pricingSnap = null;
  if (rt.pricing && rt.pricing.pricingDataId) {
    pricingSnap = await PricingData.findById(rt.pricing.pricingDataId).lean().exec();
  }

  // determine service type from moveType or rentalDetails
  let serviceType = 'Chuyển đồ lẻ';
  if (rt.moveType === 'FULL_HOUSE') serviceType = 'Chuyển nhà trọn gói';
  else if (rt.moveType === 'TRUCK_RENTAL' || (rt.rentalDetails && rt.rentalDetails.truckType)) serviceType = 'Thuê xe';

  // attach customer basic info
  let customer = null;
  if (rt.customerId) {
    const u = await User.findById(rt.customerId).lean().exec();
    if (u) customer = { fullName: u.fullName, phone: u.phone, email: u.email };
  }

  return {
    ...rt,
    pricingSnapshot: pricingSnap,
    serviceType,
    customer
  };
}

module.exports = {
  listOrders,
  getOrderById
};
