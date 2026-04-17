const MaintenanceSchedule = require('../../models/MaintenanceSchedule');
const Vehicle = require('../../models/Vehicle');
const User = require('../../models/User');

async function listAll() {
  return MaintenanceSchedule.find()
    .populate('vehicleId')
    .populate('mechanic', 'name')
    .populate('createdBy', 'name')
    .sort({ scheduledStartDate: -1 })
    .lean();
}

async function create(payload, createdBy) {
  // Ensure vehicle exists
  const vehicle = await Vehicle.findById(payload.vehicleId).select('_id plateNumber model');
  if (!vehicle) throw new Error('Vehicle not found');

  const toCreate = {
    vehicleId: payload.vehicleId,
    maintenanceType: payload.maintenanceType,
    description: payload.description || '',
    scheduledStartDate: payload.scheduledStartDate,
    scheduledEndDate: payload.scheduledEndDate,
    status: payload.status || 'Scheduled',
    cost: payload.cost || 0,
    costDetails: payload.costDetails || '',
    // accept either `mechanic` or `assignedTo` from client payload
    mechanic: payload.mechanic || payload.assignedTo || null,
    notes: payload.notes || '',
    createdBy: createdBy || null
  };

  // normalize mechanic id (client may send assignedTo as string or object)
  const rawMechanic = payload.mechanic || payload.assignedTo || null;
  let mechanicId = null;
  if (rawMechanic) {
    if (typeof rawMechanic === 'string') mechanicId = rawMechanic;
    else if (typeof rawMechanic === 'object') {
      mechanicId = rawMechanic._id || rawMechanic.id || rawMechanic.value || null;
    }
  }
  // mechanicId normalized
  if (mechanicId) {
    const user = await User.findById(mechanicId).select('role fullName');
    if (!user) throw new Error('Assigned user not found');
    if (!['driver', 'staff'].includes(user.role)) throw new Error('Assigned user must have role driver or staff');
    toCreate.mechanic = mechanicId;
  }
  // toCreate prepared for insertion

  const created = await MaintenanceSchedule.create(toCreate);
  return MaintenanceSchedule.findById(created._id).populate('vehicleId').populate('mechanic', 'name').lean();
}

async function listDrivers(options = {}) {
  // options.roles: array of roles to include (e.g. ['driver','staff'])
  // options.filter: additional mongoose filter
  const roles = Array.isArray(options.roles) ? options.roles : (options.roles ? String(options.roles).split(',') : ['driver']);
  const extra = options.filter && typeof options.filter === 'object' ? options.filter : {};
  const q = Object.assign({}, extra, { role: { $in: roles } });
  return User.find(q)
    .select('_id fullName phone avatar driverProfile.isAvailable dispatcherProfile.isAvailable role')
    .lean();
}

module.exports = {
  listAll,
  create,
  listDrivers
};
