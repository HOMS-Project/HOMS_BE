
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

// Small admin-only meta endpoint to help debug/identify automated commits
async function getAdminMeta(req, res, next) {
	try {
		const meta = {
			modifiedBy: 'auto-commit-helper',
			modifiedAt: new Date(),
			note: 'This endpoint is admin-only and added for lightweight diagnostics.'
		};
		return res.status(200).json({ success: true, data: meta });
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

/**
 * GET /api/admin/dashboard/conversion
 * Return conversion counts and pie-friendly data.
 * Response: { success: true, data: { totalRequests, successfulOrders, conversionRate, pie: [{ name, value }] } }
 */
async function getConversion(req, res, next) {
	try {
		// total request tickets (all time)
		const totalRequests = await RequestTicket.countDocuments({});

		// successful invoices (consider PAID and PARTIAL as successful)
		const successfulOrders = await Invoice.countDocuments({ paymentStatus: { $in: ['PAID', 'PARTIAL'] } });

		const conversionRate = totalRequests > 0 ? Math.round((successfulOrders / totalRequests) * 10000) / 100 : 0;

		const pie = [
			{ name: 'Đơn thành công', value: successfulOrders },
			{ name: 'Không chuyển đổi', value: Math.max(totalRequests - successfulOrders, 0) }
		];

		return res.status(200).json({ success: true, data: { totalRequests, successfulOrders, conversionRate, pie } });
	} catch (err) {
		next(err);
	}
}

module.exports = {
	getOverview,
	getRevenue,
	getOrders,
	getRecentInvoices,
	getConversion
};

/**
 * GET /api/admin/dashboard/ui
 * Return a UI-ready bundle for the admin dashboard so the frontend doesn't
 * need to perform heavy aggregation/normalization logic.
 * Query params supported: period (monthly|weekly|daily), weekStart (YYYY-MM-DD), ordersWeekStart (YYYY-MM-DD)
 */
async function getDashboardUI(req, res, next) {
	try {
		const period = req.query.period || 'monthly';
		const weekStart = req.query.weekStart ? moment(req.query.weekStart).startOf('day') : moment().startOf('year');
		const ordersWeekStart = req.query.ordersWeekStart ? moment(req.query.ordersWeekStart).startOf('day') : (moment().day() === 0 ? moment().subtract(6, 'day').startOf('day') : moment().subtract(moment().day() - 1, 'day').startOf('day'));

		// Overview (delegates to existing function/service)
		const overviewRaw = await adminStatisticService.getOverview();
		const overviewData = overviewRaw && overviewRaw.data ? overviewRaw.data : overviewRaw;
		const overview = {
			totalIncome: overviewData?.totalRevenue || 0,
			perDayIncome: overviewData?.dailyRevenue || 0,
			perDayOrders: overviewData?.dailyOrders || 0,
			customers: overviewData?.totalCustomers || 0,
		};

		// Revenue: request backend revenue buckets for the requested period
		const computeRevenueParams = () => {
			const now = moment();
			if (period === 'monthly') {
				return {
					period: 'monthly',
					startDate: now.startOf('year').format('YYYY-MM-DD'),
					endDate: now.endOf('year').format('YYYY-MM-DD')
				};
			}
			if (period === 'weekly') {
				const monday = (weekStart && weekStart.isValid()) ? weekStart.clone() : (moment().day() === 0 ? moment().subtract(6, 'day').startOf('day') : moment().subtract(moment().day() - 1, 'day').startOf('day'));
				const sunday = monday.clone().add(6, 'day').endOf('day');
				return {
					period: 'daily',
					startDate: monday.format('YYYY-MM-DD'),
					endDate: sunday.format('YYYY-MM-DD'),
					usePaymentTimeline: true
				};
			}
			// daily -> last 7 days
			return {
				period: 'daily',
				startDate: moment().subtract(6, 'day').startOf('day').format('YYYY-MM-DD'),
				endDate: moment().endOf('day').format('YYYY-MM-DD')
			};
		};

		const revenueParams = computeRevenueParams();
		const revenueArray = await adminStatisticService.getRevenueStats(revenueParams).catch(() => []);

		// Normalize revenue to UI-friendly buckets
		let revenueData = [];
		try {
			if (period === 'weekly') {
				const weekdayLabelsMonFirst = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
				const weekMap = [0, 0, 0, 0, 0, 0, 0];
				(revenueArray || []).forEach(item => {
					let d = null;
					if (item.date) d = moment(item.date);
					else if (item._id && typeof item._id === 'object' && item._id.year && item._id.month && item._id.day) {
						d = moment(`${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`);
					} else if (typeof item._id === 'string') d = moment(item._id);
					if (!d || !d.isValid()) return;
					const dayIndex = d.day();
					const pos = dayIndex === 0 ? 6 : dayIndex - 1;
					const v = Number(item.totalPrice ?? item.totalRevenue ?? item.revenue ?? item.income ?? item.value ?? 0) || 0;
					weekMap[pos] = (weekMap[pos] || 0) + v;
				});
				const mondayRef = (weekStart && weekStart.isValid()) ? weekStart.clone().startOf('day') : (moment().day() === 0 ? moment().subtract(6, 'day').startOf('day') : moment().subtract(moment().day() - 1, 'day').startOf('day'));
				revenueData = weekdayLabelsMonFirst.map((label, idx) => ({ name: `${label} - ${mondayRef.clone().add(idx, 'day').format('DD/MM')}`, income: Number(weekMap[idx] || 0) }));
			} else if (period === 'monthly') {
				const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
				const monthMap = {};
				(revenueArray || []).forEach(item => {
					const incomeVal = Number(item.totalPrice ?? item.totalRevenue ?? item.revenue ?? item.income ?? item.value ?? 0) || 0;
					let month = null;
					if (item.date && typeof item.date === 'string') {
						const parts = item.date.split('-');
						if (parts.length >= 2 && !parts[1].startsWith('W')) month = Number(parts[1]);
					}
					if (!month && item._id && typeof item._id === 'object' && item._id.month) month = Number(item._id.month);
					if (!month && item._id && typeof item._id === 'string') {
						const p = item._id.split('-'); if (p.length >= 2) month = Number(p[1]);
					}
					if (!month && item.date) {
						const d = moment(item.date);
						if (d.isValid()) month = d.month() + 1;
					}
					if (month) monthMap[month] = (monthMap[month] || 0) + incomeVal;
				});
				revenueData = monthNames.map((m, idx) => ({ name: m, income: Number(monthMap[idx + 1] || 0) }));
			} else {
				// daily: last 7 days
				const arr = [];
				for (let i = 6; i >= 0; i--) {
					const d = moment().subtract(i, 'day');
					arr.push({ date: d.format('YYYY-MM-DD'), revenue: 0 });
				}
				const map = {};
				(revenueArray || []).forEach(item => {
					const key = item.date || (item._id && typeof item._id === 'string' ? item._id : null);
					if (!key) return;
					map[key] = (map[key] || 0) + (Number(item.totalPrice ?? item.totalRevenue ?? item.revenue ?? item.income ?? item.value ?? 0) || 0);
				});
				revenueData = arr.map(a => {
					const v = map[a.date] || 0;
					const d = moment(a.date);
					const weekdayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
					return { name: weekdayLabels[d.day()] || d.format('DD MMM'), income: Number(v) };
				});
			}
		} catch (e) {
			revenueData = [];
		}

		// Orders chart (Mon..Sun) using adminDashboardService.getOrders
		const mondayRefOrders = (ordersWeekStart && moment(ordersWeekStart).isValid()) ? moment(ordersWeekStart).startOf('day') : (moment().day() === 0 ? moment().subtract(6, 'day').startOf('day') : moment().subtract(moment().day() - 1, 'day').startOf('day'));
		const orderParams = { startDate: mondayRefOrders.format('YYYY-MM-DD'), endDate: mondayRefOrders.clone().add(6, 'day').format('YYYY-MM-DD') };
		const orderArray = await adminDashboardService.getOrders(orderParams).catch(() => []);
		const dateCountMap = {};
		(orderArray || []).forEach(item => {
			let dateStr = null;
			if (item.date && typeof item.date === 'string') dateStr = item.date;
			else if (item._id && typeof item._id === 'string') dateStr = item._id;
			else if (item._id && typeof item._id === 'object' && item._id.year && item._id.month && item._id.day) {
				const y = item._id.year; const m = String(item._id.month).padStart(2, '0'); const d = String(item._id.day).padStart(2, '0');
				dateStr = `${y}-${m}-${d}`;
			}
			if (!dateStr) return;
			const v = Number(item.count ?? item.orders ?? item.value ?? 0) || 0;
			dateCountMap[dateStr] = (dateCountMap[dateStr] || 0) + v;
		});
		const weekdayLabelsMonFirst = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
		const orderData = weekdayLabelsMonFirst.map((label, idx) => {
			const day = mondayRefOrders.clone().add(idx, 'day');
			const dateKey = day.format('YYYY-MM-DD');
			return { name: label, orders: Number(dateCountMap[dateKey] || 0) };
		});

		// Recent invoices
		const recentInvoices = await adminDashboardService.getRecentInvoices({ limit: 5 }).catch(() => []);
		const lastOrders = (recentInvoices || []).map(inv => ({
			key: inv._id,
			orderId: inv.code,
			time: inv.createdAt ? moment(inv.createdAt).format('HH:mm DD/MM/YYYY') : '',
			customer: inv.customer?.fullName || '',
			status: inv.paymentStatus || inv.status || ''
		}));

		// Conversion metrics
		const totalRequests = await RequestTicket.countDocuments({});
		const successfulOrders = await Invoice.countDocuments({ paymentStatus: { $in: ['PAID', 'PARTIAL'] } });
		const conversionRate = totalRequests > 0 ? Math.round((successfulOrders / totalRequests) * 10000) / 100 : 0;
		const conversionData = [
			{ name: 'Đơn thành công', value: successfulOrders },
			{ name: 'Không chuyển đổi', value: Math.max(totalRequests - successfulOrders, 0) }
		];

		return res.status(200).json({ success: true, data: { overview, revenueData, orderData, lastOrders, conversionData, conversionRate } });
	} catch (err) {
		next(err);
	}
}

module.exports.getDashboardUI = getDashboardUI;

