const MaintenanceService = require('../../services/admin/maintenanceService');
const MaintenanceSchedule = require('../../models/MaintenanceSchedule');

// GET /api/admin/maintenances/drivers
exports.getDrivers = async (req, res, next) => {
  try {
    // Support query param `roles=driver,staff` and optional filters in future
    const roles = req.query.roles || 'driver,staff';
    const extraFilter = {};
    // Example: ?available=true could be used to filter by driverProfile.isAvailable
    if (req.query.available === 'true') {
      extraFilter['driverProfile.isAvailable'] = true;
      extraFilter['dispatcherProfile.isAvailable'] = true;
    }
    const drivers = await MaintenanceService.listDrivers({ roles, filter: extraFilter });
    return res.json(drivers);
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const schedules = await MaintenanceService.listAll();
    return res.json(schedules);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const payload = req.body;
    // basic validation
    if (!payload.vehicleId) return res.status(400).json({ message: 'vehicleId is required' });
    if (!payload.maintenanceType) return res.status(400).json({ message: 'maintenanceType is required' });
    if (!payload.scheduledStartDate || !payload.scheduledEndDate) return res.status(400).json({ message: 'scheduledStartDate and scheduledEndDate are required' });

    const created = await MaintenanceService.create(payload, req.user && req.user._id);
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/maintenances/summary/cost
// Returns total maintenance cost and breakdown by status
exports.costSummary = async (req, res, next) => {
  try {
    // Total cost and count
    const totalAgg = await MaintenanceSchedule.aggregate([
      { $group: { _id: null, totalCost: { $sum: '$cost' }, totalCount: { $sum: 1 } } }
    ]);

    // Breakdown by status
    const byStatusAgg = await MaintenanceSchedule.aggregate([
      { $group: { _id: '$status', totalCost: { $sum: '$cost' }, count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', totalCost: 1, count: 1 } }
    ]);

    const total = totalAgg && totalAgg[0] ? { totalCost: totalAgg[0].totalCost || 0, totalCount: totalAgg[0].totalCount || 0 } : { totalCost: 0, totalCount: 0 };

    return res.json({
      totalCost: total.totalCost,
      totalCount: total.totalCount,
      byStatus: byStatusAgg
    });
  } catch (err) {
    next(err);
  }
};
