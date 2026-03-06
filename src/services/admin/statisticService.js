const Invoice = require('../../models/Invoice');
const RequestTicket = require('../../models/RequestTicket');
const moment = require('moment');

/**
 * Thống kê doanh thu theo khoảng thời gian (Ngày/Tháng/Năm)
 */
exports.getRevenueStats = async (query) => {
    const { startDate, endDate, period = 'daily' } = query;

    let filter = { paymentStatus: 'PAID' };

    if (startDate && endDate) {
        filter.createdAt = {
            $gte: moment(startDate).startOf('day').toDate(),
            $lte: moment(endDate).endOf('day').toDate()
        };
    } else {
        // Mặc định 30 ngày gần nhất
        filter.createdAt = {
            $gte: moment().subtract(30, 'days').startOf('day').toDate(),
            $lte: moment().endOf('day').toDate()
        };
    }

    // Pipeline gom nhóm (Group) tùy theo period (Ngày, Tháng, Năm)
    let groupId;
    switch (period) {
        case 'monthly':
            groupId = { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } };
            break;
        case 'yearly':
            groupId = { year: { $year: "$createdAt" } };
            break;
        case 'daily':
        default:
            groupId = { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, day: { $dayOfMonth: "$createdAt" } };
            break;
    }

    const revenue = await Invoice.aggregate([
        { $match: filter },
        {
            $group: {
                _id: groupId,
                totalRevenue: { $sum: "$priceSnapshot.totalPrice" },
                count: { $sum: 1 }
            }
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
    ]);

    return revenue.map(item => ({
        date: period === 'daily' ? `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}` :
            period === 'monthly' ? `${item._id.year}-${String(item._id.month).padStart(2, '0')}` :
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
    // Tổng số đơn trong ngày hôm nay
    const today = moment().startOf('day').toDate();

    // Đơn mới hôm nay
    const newOrdersToday = await RequestTicket.countDocuments({
        createdAt: { $gte: today }
    });

    // Doanh thu hôm nay
    const revenueTodayAggr = await Invoice.aggregate([
        {
            $match: {
                paymentStatus: 'PAID',
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
    const revenueToday = revenueTodayAggr.length > 0 ? revenueTodayAggr[0].total : 0;

    return {
        newOrdersToday,
        revenueToday,
    };
};
