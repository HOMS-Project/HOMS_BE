const express = require('express');
const router = express.Router();
const vehicleController = require('../../controllers/admin/vehicleController');

// GET /api/admin/vehicles
router.get('/', vehicleController.listVehicles);

// GET /api/admin/vehicles/dashboard
router.get('/dashboard', vehicleController.getDashboard);

// POST /api/admin/vehicles
router.post('/', vehicleController.createVehicle);

// PUT /api/admin/vehicles/:id
router.put('/:id', vehicleController.updateVehicle);

// DELETE /api/admin/vehicles/:id
router.delete('/:id', vehicleController.deleteVehicle);

// GET assignments for a vehicle (with optional start/end ISO date query)
router.get('/:id/assignments', vehicleController.getAssignmentsForVehicle);

module.exports = router;
