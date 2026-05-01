const RequestTicket = require('../../models/RequestTicket');
const PricingData = require('../../models/PricingData');
const User = require('../../models/User');

/**
 * Get paginated request tickets for admin panel.
 * Supports filters: status, from,to (dates), search (code/customer phone/name)
 */
async function listOrders({ page = 1, limit = 20, status, from, to, search }) {
  const q = {};
  if (status) q.status = status;

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

  const [items, total] = await Promise.all([
    RequestTicket.find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean()
      .exec(),
    RequestTicket.countDocuments(q)
  ]);

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
    { $group: { _id: '$status', value: { $sum: 1 } } }
  ]).exec();

  const statusDistribution = statusAgg.map(s => ({ name: s._id, value: s.value }));

  const charts = { timeseries, statusDistribution };

  return { items: normalized, total, page: Number(page), limit: Number(limit), metrics, charts };
}

module.exports = {
  listOrders
};
