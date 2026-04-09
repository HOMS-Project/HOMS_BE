const Vehicle = require('../../models/Vehicle');
const DispatchAssignment = require('../../models/DispatchAssignment');

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
  const vehicles = await Vehicle.find(query).sort({ createdAt: -1 }).lean();

  // Determine which vehicles are currently assigned (in-transit) by checking DispatchAssignment documents.
  // Consider a vehicle assigned if:
  // - There exists a DispatchAssignment document whose overall status is ASSIGNED/CONFIRMED/IN_DISPATCH and that references the vehicle
  // OR
  // - There exists an assignment entry where assignment.status is CONFIRMED/ACCEPTED/IN_PROGRESS
  if (vehicles.length === 0) return vehicles;

  const vehicleObjectIds = vehicles.map(v => v._id);

  const dispatchDocs = await DispatchAssignment.find({
    $or: [
      { status: { $in: ['ASSIGNED', 'CONFIRMED', 'IN_DISPATCH'] }, 'assignments.vehicleId': { $in: vehicleObjectIds } },
      { 'assignments': { $elemMatch: { vehicleId: { $in: vehicleObjectIds }, status: { $in: ['CONFIRMED', 'ACCEPTED', 'IN_PROGRESS'] } } } }
    ]
  }).lean();

  const activeVehicleIdSet = new Set();
  dispatchDocs.forEach(doc => {
    const outerActive = ['ASSIGNED', 'CONFIRMED', 'IN_DISPATCH'].includes(doc.status);
    (doc.assignments || []).forEach(a => {
      if (!a || !a.vehicleId) return;
      const vid = String(a.vehicleId);
      if (outerActive || ['CONFIRMED', 'ACCEPTED', 'IN_PROGRESS'].includes(a.status)) {
        activeVehicleIdSet.add(vid);
      }
    });
  });

  // Set status based on active set; preserve 'Maintenance' if set on vehicle record.
  vehicles.forEach(v => {
    try {
      const idStr = String(v._id);
      if (v.status === 'Maintenance') return; // keep maintenance state
      if (activeVehicleIdSet.has(idStr)) v.status = 'InTransit';
      else v.status = 'Available';
    } catch (e) {
      // ignore
    }
  });

  return vehicles;
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
  // Return dashboard stats: counts and breakdowns used by admin FE
  async getDashboard() {
    // total count
    const total = await Vehicle.countDocuments();
    // basic status counts
    const available = await Vehicle.countDocuments({ status: 'Available' });
    const inTransit = await Vehicle.countDocuments({ status: 'InTransit' });
    const maintenance = await Vehicle.countDocuments({ status: 'Maintenance' });

    // counts by vehicleType
    const agg = await Vehicle.aggregate([
      { $group: { _id: '$vehicleType', count: { $sum: 1 } } }
    ]).exec();
    const countsByType = {};
    agg.forEach(a => { countsByType[a._id] = a.count; });

    return { total, available, inTransit, maintenance, countsByType };
  }
  ,
  async getAssignmentsForVehicle(vehicleId, startIso, endIso) {
    // Find vehicle by vehicleId
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return [];

    const vid = vehicle._id;

    // Build time filter if provided
    const start = startIso ? new Date(startIso) : null;
    const end = endIso ? new Date(endIso) : null;

    // Find dispatch documents that contain this vehicle in assignments
    const docs = await DispatchAssignment.find({ 'assignments.vehicleId': vid }).lean();

    const results = [];
    docs.forEach(doc => {
      const invoiceId = doc.invoiceId;
      (doc.assignments || []).forEach(a => {
        if (!a || !a.vehicleId) return;
        if (String(a.vehicleId) !== String(vid)) return;
        const pickup = a.pickupTime ? new Date(a.pickupTime) : null;
        const delivery = a.deliveryTime ? new Date(a.deliveryTime) : null;
        // Filter by provided range (if any) using pickup time primarily
        if (start && pickup && pickup < start) return;
        if (end && pickup && pickup > end) return;

        results.push({
          dispatchAssignmentId: doc._id,
          invoiceId,
          assignmentStatus: a.status,
          pickupTime: pickup,
          deliveryTime: delivery,
          loadWeight: a.loadWeight,
          loadVolume: a.loadVolume,
          routeId: a.routeId || doc.routeId || null,
          notes: a.notes || '',
        });
      });
    });

    // Optionally sort by pickupTime
    results.sort((x, y) => (x.pickupTime || 0) - (y.pickupTime || 0));
    return results;
  }
};
