const express = require('express');
const router = express.Router();
const dispatchController = require('../../controllers/admin/dispatchController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

router.use(verifyToken);
router.use(authorize('admin', 'staff', 'dispatcher'));

// GET /api/admin/dispatch-assignments/by-vehicle/:vehicleId
router.get('/by-vehicle/:vehicleId', dispatchController.getAssignmentsByVehicle);

// POST /api/admin/dispatch-assignments/optimal-squad
router.post('/optimal-squad', dispatchController.suggestOptimalSquad);

// POST /api/admin/dispatch-assignments/invoice/:invoiceId/allocate
router.post('/invoice/:invoiceId/allocate', dispatchController.dispatchVehicles);

// POST /api/admin/dispatch-assignments/invoice/:invoiceId/confirm
router.post('/invoice/:invoiceId/confirm', dispatchController.confirmDispatch);

// POST /api/admin/dispatch-assignments/check-availability
router.post('/check-availability', dispatchController.checkAvailability);

module.exports = router;
