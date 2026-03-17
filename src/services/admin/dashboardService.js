const RequestTicket = require('../../models/RequestTicket');
const Invoice = require('../../models/Invoice');
const User = require('../../models/User');
const moment = require('moment');

/**
 * Return time-series of request tickets counts between startDate and endDate (inclusive).
 * If no dates provided, default to last 7 days (today included) broken down by day.
 * Response: [{ date: 'YYYY-MM-DD', count: Number }, ...]
 */
exports.getOrders = async (query) => {
    let { startDate, endDate } = query || {};
    const now = moment();
    if (!startDate || !endDate) {
        // default: last 7 days
        startDate = now.clone().subtract(6, 'day').startOf('day').toDate();
        endDate = now.clone().endOf('day').toDate();
    } else {
        startDate = moment(startDate).startOf('day').toDate();
        endDate = moment(endDate).endOf('day').toDate();
    }

    const pipeline = [
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                    day: { $dayOfMonth: '$createdAt' }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ];

    const raw = await RequestTicket.aggregate(pipeline);

    // Build full day list from startDate..endDate and fill zeros
    const start = moment(startDate).startOf('day');
    const end = moment(endDate).startOf('day');
    const days = [];
    for (let m = start.clone(); m.diff(end) <= 0; m.add(1, 'day')) {
        days.push(m.clone());
    }

    const mapKey = (r) => `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`;
    const rawMap = {};
    raw.forEach(r => { rawMap[mapKey(r)] = r.count; });

    return days.map(d => ({ date: d.format('YYYY-MM-DD'), count: rawMap[d.format('YYYY-MM-DD')] || 0 }));
};

/**
 * Return recent invoices with customer and basic info to show in dashboard table.
 * Query may include limit (default 5).
 * Response: [{ _id, code, createdAt, customer: { _id, fullName }, paymentStatus, status }, ...]
 */
exports.getRecentInvoices = async (query) => {
    const limit = Math.min(parseInt(query.limit || 5, 10) || 5, 50);
    const invoices = await Invoice.find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate({ path: 'customerId', select: 'fullName phone email' })
        .lean();

    return invoices.map(inv => ({
        _id: inv._id,
        code: inv.code,
        createdAt: inv.createdAt,
        customer: inv.customerId ? { _id: inv.customerId._id, fullName: inv.customerId.fullName, phone: inv.customerId.phone } : null,
        paymentStatus: inv.paymentStatus,
        status: inv.status,
        totalPrice: inv.priceSnapshot?.totalPrice || 0
    }));
};
