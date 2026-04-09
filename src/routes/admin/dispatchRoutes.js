const express = require('express');
const router = express.Router();
const dispatchController = require('../../controllers/admin/dispatchController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

router.use(verifyToken);
router.use(authorize('admin', 'staff', 'dispatcher'));

// GET /api/admin/dispatch-assignments/by-vehicle/:vehicleId
router.get('/by-vehicle/:vehicleId', dispatchController.getAssignmentsByVehicle);

module.exports = router;
