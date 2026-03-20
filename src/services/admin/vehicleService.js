const Vehicle = require('../../models/Vehicle');

/**
 * Generate a unique vehicleId in format VCL-XXX where XXX is 3 digits
 */
async function generateVehicleId() {
  const pad = (n) => String(n).padStart(3, '0');
  for (let attempt = 0; attempt < 10; attempt++) {
    const num = Math.floor(Math.random() * 1000); // 0 - 999
    const id = `VCL-${pad(num)}`;
    const exists = await Vehicle.findOne({ vehicleId: id }).lean();
    if (!exists) return id;
  }
  // fallback sequential approach
  const count = await Vehicle.countDocuments();
  return `VCL-${pad((count + 1) % 1000)}`;
}

async function listVehicles(filter = {}) {
  // simple list with optional status filter
  const query = {};
  if (filter.status) query.status = filter.status;
  return Vehicle.find(query).sort({ createdAt: -1 }).lean();
}

async function createVehicle(data) {
  // data: { plateNumber, vehicleType, loadCapacity, status }
  // ensure unique plateNumber handled by schema; check beforehand for clearer error
  const existing = await Vehicle.findOne({ plateNumber: data.plateNumber });
  if (existing) {
    const err = new Error('License plate number already exists.');
    err.status = 400;
    throw err;
  }

  const vehicleId = await generateVehicleId();

  const v = new Vehicle({
    vehicleId,
    plateNumber: data.plateNumber,
    vehicleType: data.vehicleType,
    loadCapacity: data.loadCapacity || null,
    status: data.status || 'Available',
    isActive: true,
  });

  await v.save();
  return v.toObject();
}

async function updateVehicleById(vehicleId, data) {
  const v = await Vehicle.findOne({ vehicleId });
  if (!v) {
    const err = new Error('Vehicle not found');
    err.status = 404;
    throw err;
  }

  // If updating plateNumber, ensure uniqueness
  if (data.plateNumber && data.plateNumber !== v.plateNumber) {
    const exists = await Vehicle.findOne({ plateNumber: data.plateNumber });
    if (exists) {
      const err = new Error('License plate number already exists.');
      err.status = 400;
      throw err;
    }
    v.plateNumber = data.plateNumber;
  }

  if (data.vehicleType) v.vehicleType = data.vehicleType;
  if (typeof data.loadCapacity !== 'undefined') v.loadCapacity = data.loadCapacity;
  if (data.status) v.status = data.status;
  if (typeof data.isActive !== 'undefined') v.isActive = data.isActive;

  await v.save();
  return v.toObject();
}

async function deleteVehicleById(vehicleId) {
  const v = await Vehicle.findOne({ vehicleId });
  if (!v) {
    const err = new Error('Vehicle not found');
    err.status = 404;
    throw err;
  }

  // Business rule: cannot delete vehicle assigned or in transit
  if (v.status === 'InTransit') {
    const err = new Error('Vehicle is currently assigned and cannot be deleted.');
    err.status = 400;
    throw err;
  }

  await Vehicle.deleteOne({ vehicleId });
  return true;
}

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicleById,
  deleteVehicleById,
};