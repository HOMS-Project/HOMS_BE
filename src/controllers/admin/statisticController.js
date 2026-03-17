const adminStatisticService = require('../../services/admin/statisticService');

exports.getRevenueStats = async (req, res, next) => {
    try {
        const revenue = await adminStatisticService.getRevenueStats(req.query);
        res.status(200).json({ success: true, data: revenue });
    } catch (error) {
        next(error);
    }
};

exports.getOrderStats = async (req, res, next) => {
    try {
        const orders = await adminStatisticService.getOrderStats(req.query);
        res.status(200).json({ success: true, data: orders });
    } catch (error) {
        next(error);
    }
};

exports.getOverview = async (req, res, next) => {
    try {
        const overview = await adminStatisticService.getOverview();
        res.status(200).json({ success: true, data: overview });
    } catch (error) {
        next(error);
    }
};

exports.getRequestTicketsDaily = async (req, res, next) => {
    try {
        const data = await adminStatisticService.getRequestTicketsDaily(req.query);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};
