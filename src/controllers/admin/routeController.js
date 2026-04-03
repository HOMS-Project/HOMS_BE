const adminRouteService = require('../../services/admin/routeService');

exports.getAllRoutes = async (req, res, next) => {
    try {
        const routes = await adminRouteService.getAllRoutes(req.query);
        res.status(200).json({ success: true, data: routes });
    } catch (error) {
        next(error);
    }
};

exports.getRouteById = async (req, res, next) => {
    try {
        const route = await adminRouteService.getRouteById(req.params.id);
        res.status(200).json({ success: true, data: route });
    } catch (error) {
        if (error.message === 'Route not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.createRoute = async (req, res, next) => {
    try {
        const newRoute = await adminRouteService.createRoute(req.body);
        res.status(201).json({ success: true, data: newRoute });
    } catch (error) {
        if (error.message === 'Route code already exists') {
            return res.status(400).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.updateRoute = async (req, res, next) => {
    try {
        const updatedRoute = await adminRouteService.updateRoute(req.params.id, req.body);
        res.status(200).json({ success: true, data: updatedRoute });
    } catch (error) {
        if (error.message === 'Route not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.addTrafficRule = async (req, res, next) => {
    try {
        const route = await adminRouteService.addTrafficRule(req.params.id, req.body);
        res.status(200).json({ success: true, data: route });
    } catch (error) {
        if (error.message === 'Route not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.updateTrafficRule = async (req, res, next) => {
    try {
        const route = await adminRouteService.updateTrafficRule(req.params.id, req.params.ruleId, req.body);
        res.status(200).json({ success: true, data: route });
    } catch (error) {
        if (error.message === 'Route not found' || error.message === 'Traffic rule not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.addRoadRestriction = async (req, res, next) => {
    try {
        const route = await adminRouteService.addRoadRestriction(req.params.id, req.body);
        res.status(200).json({ success: true, data: route });
    } catch (error) {
        if (error.message === 'Route not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.updateRoadRestriction = async (req, res, next) => {
    try {
        const route = await adminRouteService.updateRoadRestriction(req.params.id, req.params.resId, req.body);
        res.status(200).json({ success: true, data: route });
    } catch (error) {
        if (error.message === 'Route not found' || error.message === 'Road restriction not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.deleteTrafficRule = async (req, res, next) => {
    try {
        const route = await adminRouteService.deleteTrafficRule(req.params.id, req.params.ruleId);
        res.status(200).json({ success: true, data: route });
    } catch (error) {
        if (error.message === 'Route not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.deleteRoadRestriction = async (req, res, next) => {
    try {
        const route = await adminRouteService.deleteRoadRestriction(req.params.id, req.params.resId);
        res.status(200).json({ success: true, data: route });
    } catch (error) {
        if (error.message === 'Route not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.deleteRoute = async (req, res, next) => {
    try {
        const route = await adminRouteService.deleteRoute(req.params.id);
        res.status(200).json({ success: true, message: 'Route deactivated', data: route });
    } catch (error) {
        if (error.message === 'Route not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};
