const vehicleService = require('../../services/admin/vehicleService');

async function listVehicles(req, res, next) {
  try {
    const { status } = req.query;
    const list = await vehicleService.listVehicles({ status });
    res.json(list);
  } catch (err) {
    next(err);
  }
}


async function getDashboard(req, res, next) {
  try {
    const stats = await vehicleService.getDashboard();
    // FE expects response in res.data.data (adminVehicleService.getDashboard uses res.data?.data)
    return res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}


async function createVehicle(req, res, next) {
  try {
    // Expecting body: { plateNumber, vehicleType, loadCapacity }
    const plateNumber = req.body.plateNumber || req.body.licensePlate;
    const vehicleType = req.body.vehicleType || req.body.type;
    const loadCapacity = req.body.loadCapacity || req.body.capacity;
    if (!plateNumber || !vehicleType) {
      return res.status(400).json({ message: 'Please fill in all required fields.' });
    }
    const v = await vehicleService.createVehicle({ plateNumber, vehicleType, loadCapacity });
    res.status(201).json(v);
  } catch (err) {
    next(err);
  }
}

async function updateVehicle(req, res, next) {
  try {
    const { id } = req.params; // vehicleId like VCL-001
    const payload = {
      plateNumber: req.body.plateNumber || req.body.licensePlate,
      vehicleType: req.body.vehicleType || req.body.type,
      loadCapacity: req.body.loadCapacity || req.body.capacity,
      status: req.body.status,
      isActive: req.body.isActive,
    };
    const v = await vehicleService.updateVehicleById(id, payload);
    res.json(v);
  } catch (err) {
    next(err);
  }
}

async function deleteVehicle(req, res, next) {
  try {
    const { id } = req.params;
    await vehicleService.deleteVehicleById(id);
    res.json({ message: 'Vehicle deleted successfully.' });
  } catch (err) {
    next(err);
  }
}

async function getAssignmentsForVehicle(req, res, next) {
  try {
    const { id } = req.params; // vehicleId (VCL-...)
    const { start, end } = req.query; // optional ISO dates
    const stats = await vehicleService.getAssignmentsForVehicle(id, start, end);
    return res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getAssignmentsForVehicle,
  getDashboard,
};
