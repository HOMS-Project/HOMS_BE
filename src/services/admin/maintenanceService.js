const MaintenanceSchedule = require('../../models/MaintenanceSchedule');
const Vehicle = require('../../models/Vehicle');

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
    costDetails: payload.costDetails || payload.costDetails || '',
    mechanic: payload.mechanic || null,
    notes: payload.notes || '',
    createdBy: createdBy || null
  };

  const created = await MaintenanceSchedule.create(toCreate);
  return MaintenanceSchedule.findById(created._id).populate('vehicleId').populate('mechanic', 'name').lean();
}

module.exports = {
  listAll,
  create
};
