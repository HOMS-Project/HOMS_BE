const Route = require('../../models/Route');

/**
 * Lấy danh sách các tuyến đường kèm bộ lọc
 */
exports.getAllRoutes = async (query = {}) => {
    const { search, isActive } = query;
    let filter = {};

    if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
    }

    if (search) {
        filter.$or = [
            { code: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } }
        ];
    }

    return await Route.find(filter).sort({ createdAt: -1 });
};

/**
 * Lấy chi tiết 1 tuyến đường
 */
exports.getRouteById = async (id) => {
    const route = await Route.findById(id);
    if (!route) throw new Error('Route not found');
    return route;
};

/**
 * Tạo tuyến đường mới (kèm luật giao thông)
 */
exports.createRoute = async (routeData) => {
    const existingRoute = await Route.findOne({ code: routeData.code });
    if (existingRoute) throw new Error('Route code already exists');

    const newRoute = new Route(routeData);
    return await newRoute.save();
};

/**
 * Cập nhật tuyến đường (thêm/sửa luật giao thông)
 */
exports.updateRoute = async (id, updateData) => {
    const route = await Route.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    );

    if (!route) throw new Error('Route not found');
    return route;
};

/**
 * Thêm luật giao thông mới vào tuyến đường hiện có
 */
exports.addTrafficRule = async (routeId, ruleData) => {
    const route = await Route.findById(routeId);
    if (!route) throw new Error('Route not found');

    route.trafficRules.push(ruleData);
    return await route.save();
};

/**
 * Thêm hạn chế đường bộ mới vào tuyến đường
 */
exports.addRoadRestriction = async (routeId, restrictionData) => {
    const route = await Route.findById(routeId);
    if (!route) throw new Error('Route not found');

    route.roadRestrictions.push(restrictionData);
    return await route.save();
};

/**
 * Cập nhật luật giao thông của tuyến đường
 */
exports.updateTrafficRule = async (routeId, ruleId, ruleData) => {
    const route = await Route.findById(routeId);
    if (!route) throw new Error('Route not found');

    const rule = route.trafficRules.id(ruleId);
    if (!rule) throw new Error('Traffic rule not found');

    rule.set(ruleData);
    return await route.save();
};

/**
 * Cập nhật đoạn hạn chế của tuyến đường 
 */
exports.updateRoadRestriction = async (routeId, restrictionId, restrictionData) => {
    const route = await Route.findById(routeId);
    if (!route) throw new Error('Route not found');

    const restriction = route.roadRestrictions.id(restrictionId);
    if (!restriction) throw new Error('Road restriction not found');

    restriction.set(restrictionData);
    return await route.save();
};

/**
 * Xóa luật giao thông khỏi tuyến đường
 */
exports.deleteTrafficRule = async (routeId, ruleId) => {
    const route = await Route.findById(routeId);
    if (!route) throw new Error('Route not found');

    route.trafficRules = route.trafficRules.filter(r => r._id.toString() !== ruleId);
    return await route.save();
};

/**
 * Xóa đoạn đường cấm khỏi tuyến đường
 */
exports.deleteRoadRestriction = async (routeId, restrictionId) => {
    const route = await Route.findById(routeId);
    if (!route) throw new Error('Route not found');

    route.roadRestrictions = route.roadRestrictions.filter(r => r._id.toString() !== restrictionId);
    return await route.save();
};

/**
 * Xóa/Vô hiệu hóa tuyến đường
 */
exports.deleteRoute = async (id) => {
    const route = await Route.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true }
    );

    if (!route) throw new Error('Route not found');
    return route;
};
