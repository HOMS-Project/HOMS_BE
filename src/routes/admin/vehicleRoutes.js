const express = require('express');
const router = express.Router();
const vehicleController = require('../../controllers/admin/vehicleController');

// GET /api/admin/vehicles
router.get('/', vehicleController.listVehicles);

// POST /api/admin/vehicles
router.post('/', vehicleController.createVehicle);

// PUT /api/admin/vehicles/:id
router.put('/:id', vehicleController.updateVehicle);

// DELETE /api/admin/vehicles/:id
router.delete('/:id', vehicleController.deleteVehicle);

module.exports = router;
