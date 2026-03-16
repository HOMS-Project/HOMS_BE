const Invoice = require('../../models/Invoice');
const RequestTicket = require('../../models/RequestTicket');
const moment = require('moment');

/**
 * Thống kê doanh thu theo khoảng thời gian (Ngày/Tháng/Năm)
 */
exports.getRevenueStats = async (query) => {
    const { startDate, endDate, period = 'daily', usePaymentTimeline } = query;

    if (usePaymentTimeline === 'true' || usePaymentTimeline === true) {
        // Build a tolerant pipeline:
        // - consider invoices with paymentStatus PAID or PARTIAL
        // - unwind timeline (preserve empty) and mark timeline entries that look like payment events
        // - compute per-invoice paidAt = max(paidCandidate)
        // - fallback paidAt to createdAt if no paidCandidate
        // - filter by paidAt range and group by paidAt

        const matchPaid = { $match: { paymentStatus: { $in: ['PAID', 'PARTIAL'] } } };

        // unwind timeline entries but don't drop invoices with empty timeline
        const unwind = { $unwind: { path: '$timeline', preserveNullAndEmptyArrays: true } };

        // mark timeline entries that appear to be payment updates
        const markPaidCandidate = {
            $addFields: {
                paidCandidate: {
                    $cond: [
                        { $and: [ { $ne: ['$timeline', null] }, { $in: ['$timeline.status', ['PAID', 'PARTIAL']] } ] },
                        '$timeline.updatedAt',
                        null
                    ]
                }
            }
        };

        // group per-invoice: pick the latest paidCandidate and keep createdAt and revenue
        const groupPerInvoice = {
            $group: {
                _id: '$_id',
                paidAt: { $max: '$paidCandidate' },
                revenue: { $first: '$priceSnapshot.totalPrice' },
                createdAt: { $first: '$createdAt' }
            }
        };

        // fallback paidAt to createdAt when no paidCandidate exists
        const fillPaidAt = { $addFields: { paidAt: { $ifNull: ['$paidAt', '$createdAt'] } } };

        const paidAtRangeMatch = (startDate && endDate) ? { $match: { paidAt: { $gte: moment(startDate).startOf('day').toDate(), $lte: moment(endDate).endOf('day').toDate() } } } : null;

        // group by paidAt according to period
        let groupByPaidAt;
        switch (period) {
            case 'monthly':
                groupByPaidAt = { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } };
                break;
            case 'weekly':
                groupByPaidAt = { year: { $year: '$paidAt' }, week: { $week: '$paidAt' } };
                break;
            case 'yearly':
                groupByPaidAt = { year: { $year: '$paidAt' } };
                break;
            case 'daily':
            default:
                groupByPaidAt = { year: { $year: '$paidAt' }, month: { $month: '$paidAt' }, day: { $dayOfMonth: '$paidAt' } };
                break;
        }

        const groupFinal = {
            $group: {
                _id: groupByPaidAt,
                totalRevenue: { $sum: '$revenue' },
                count: { $sum: 1 }
            }
        };

        const pipeline = [matchPaid, unwind, markPaidCandidate, groupPerInvoice, fillPaidAt];
        if (paidAtRangeMatch) pipeline.push(paidAtRangeMatch);
        pipeline.push(groupFinal);

        const sortObj = { '_id.year': 1 };
        if (period === 'monthly') sortObj['_id.month'] = 1;
        if (period === 'weekly') sortObj['_id.week'] = 1;
        if (period === 'daily') { sortObj['_id.month'] = 1; sortObj['_id.day'] = 1; }
        pipeline.push({ $sort: sortObj });

        const revenue = await Invoice.aggregate(pipeline);
        return revenue.map(item => ({
            date: period === 'daily' ? `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}` :
                period === 'monthly' ? `${item._id.year}-${String(item._id.month).padStart(2, '0')}` :
                    period === 'weekly' ? `${item._id.year}-W${String(item._id.week).padStart(2, '0')}` :
                        `${item._id.year}`,
            revenue: item.totalRevenue,
            totalRevenue: item.totalRevenue,
            invoices: item.count
        }));
    }

    // Fallback to original behavior grouping by createdAt
    let filter = { paymentStatus: { $in: ['PAID', 'PARTIAL'] } };

    if (startDate && endDate) {
        filter.createdAt = {
            $gte: moment(startDate).startOf('day').toDate(),
            $lte: moment(endDate).endOf('day').toDate()
        };
    } else {
        filter.createdAt = {
            $gte: moment().subtract(30, 'days').startOf('day').toDate(),
            $lte: moment().endOf('day').toDate()
        };
    }

    let groupId;
    switch (period) {
        case 'monthly':
            groupId = { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } };
            break;
        case 'weekly':
            groupId = { year: { $year: "$createdAt" }, week: { $week: "$createdAt" } };
            break;
        case 'yearly':
            groupId = { year: { $year: "$createdAt" } };
            break;
        case 'daily':
        default:
            groupId = { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } };
            break;
    }

    const sortObj = { '_id.year': 1 };
    if (period === 'monthly') sortObj['_id.month'] = 1;
    if (period === 'weekly') sortObj['_id.week'] = 1;
    if (period === 'daily') { sortObj['_id.month'] = 1; sortObj['_id.day'] = 1; }

    const revenue = await Invoice.aggregate([
        { $match: filter },
        {
            $group: {
                _id: groupId,
                totalRevenue: { $sum: "$priceSnapshot.totalPrice" },
                count: { $sum: 1 }
            }
        },
        { $sort: sortObj }
    ]);

    return revenue.map(item => ({
        date: period === 'daily' ? `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}` :
            period === 'monthly' ? `${item._id.year}-${String(item._id.month).padStart(2, '0')}` :
                period === 'weekly' ? `${item._id.year}-W${String(item._id.week).padStart(2, '0')}` :
                    `${item._id.year}`,
        revenue: item.totalRevenue,
        invoices: item.count
    }));
};

/**
 * Thống kê số lượng đơn hàng (RequestTicket) theo trạng thái
 */
exports.getOrderStats = async (query) => {
    const { startDate, endDate } = query;
    let filter = {};

    if (startDate && endDate) {
        filter.createdAt = {
            $gte: moment(startDate).startOf('day').toDate(),
            $lte: moment(endDate).endOf('day').toDate()
        };
    }

    const orders = await RequestTicket.aggregate([
        { $match: filter },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 }
            }
        }
    ]);

    // Format output
    const statusCounts = {
        DRAFT: 0, PENDING: 0, SURVEYING: 0, PRICED: 0,
        CONTRACTED: 0, ASSIGNED: 0, IN_PROGRESS: 0,
        COMPLETED: 0, CANCELLED: 0
    };

    let total = 0;
    orders.forEach(order => {
        if (statusCounts.hasOwnProperty(order._id)) {
            statusCounts[order._id] = order.count;
            total += order.count;
        }
    });

    return {
        total,
        statusCounts
    };
};

/**
 * Tổng quan Dashboard (Overview)
 */
exports.getOverview = async () => {
    // Tổng quan dashboard trả về các trường mà FE mong đợi:
    // { totalRevenue, dailyRevenue, dailyOrders, totalCustomers }
    const today = moment().startOf('day').toDate();

    // Số đơn mới hôm nay
    const dailyOrders = await RequestTicket.countDocuments({
        createdAt: { $gte: today }
    });

    // Doanh thu hôm nay (chỉ tính các hoá đơn đã thanh toán)
    const dailyRevenueAggr = await Invoice.aggregate([
        {
            $match: {
                paymentStatus: { $in: ['PAID', 'PARTIAL'] },
                createdAt: { $gte: today }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: "$priceSnapshot.totalPrice" }
            }
        }
    ]);
    const dailyRevenue = dailyRevenueAggr.length > 0 ? dailyRevenueAggr[0].total : 0;

    // Tổng doanh thu (toàn bộ thời gian) - chỉ tính hoá đơn đã thanh toán
    const totalRevenueAggr = await Invoice.aggregate([
        { $match: { paymentStatus: { $in: ['PAID', 'PARTIAL'] } } },
        { $group: { _id: null, total: { $sum: "$priceSnapshot.totalPrice" } } }
    ]);
    const totalRevenue = totalRevenueAggr.length > 0 ? totalRevenueAggr[0].total : 0;

    // Tổng số khách hàng (Users với role 'customer' và status Active)
    const User = require('../../models/User');
    const totalCustomers = await User.countDocuments({ role: 'customer', status: 'Active' });

    return {
        totalRevenue,
        dailyRevenue,
        dailyOrders,
        totalCustomers
    };
};
