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

  return { items: normalized, total, page: Number(page), limit: Number(limit) };
}

module.exports = {
  listOrders
};
