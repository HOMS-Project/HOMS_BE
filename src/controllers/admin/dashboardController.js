
const Invoice = require('../../models/Invoice');
const RequestTicket = require('../../models/RequestTicket');
const User = require('../../models/User');
const moment = require('moment');
const adminStatisticService = require('../../services/admin/statisticService');
const adminDashboardService = require('../../services/admin/dashboardService');

/**
 * GET /api/admin/dashboard/overview
 * Compute overview metrics and return shape expected by frontend:
 * { totalRevenue, dailyRevenue, dailyOrders, totalCustomers }
 */
async function getOverview(req, res, next) {
	try {
		const today = moment().startOf('day').toDate();

		// daily orders
		const dailyOrders = await RequestTicket.countDocuments({ createdAt: { $gte: today } });

		// daily revenue (include PAID and PARTIAL invoices)
		const dailyRevenueAggr = await Invoice.aggregate([
			{ $match: { paymentStatus: { $in: ['PAID', 'PARTIAL'] }, createdAt: { $gte: today } } },
			{ $group: { _id: null, total: { $sum: '$priceSnapshot.totalPrice' } } }
		]);
		const dailyRevenue = dailyRevenueAggr.length ? dailyRevenueAggr[0].total : 0;

		// total revenue (include PAID and PARTIAL invoices)
		const totalRevenueAggr = await Invoice.aggregate([
			{ $match: { paymentStatus: { $in: ['PAID', 'PARTIAL'] } } },
			{ $group: { _id: null, total: { $sum: '$priceSnapshot.totalPrice' } } }
		]);
		const totalRevenue = totalRevenueAggr.length ? totalRevenueAggr[0].total : 0;

		// total customers
		const totalCustomers = await User.countDocuments({ role: 'customer' });

		const data = {
			totalRevenue,
			dailyRevenue,
			dailyOrders,
			totalCustomers,
		};

		return res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
}

async function getRevenue(req, res, next) {
	try {
		const data = await adminStatisticService.getRevenueStats(req.query);
		// Return shape consistent with other endpoints: { success: true, data: [...] }
		return res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
}

async function getOrders(req, res, next) {
	try {
		// Return time-series of RequestTicket counts (per day by default)
		const data = await adminDashboardService.getOrders(req.query);
		return res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
}

async function getRecentInvoices(req, res, next) {
	try {
		const data = await adminDashboardService.getRecentInvoices(req.query);
		return res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
}

module.exports = {
	getOverview,
	getRevenue,
	getOrders,
	getRecentInvoices
};