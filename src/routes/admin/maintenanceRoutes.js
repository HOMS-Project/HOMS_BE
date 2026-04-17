const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/maintenanceController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

// GET /api/admin/maintenances - list all
router.get('/', controller.getAll);

// GET /api/admin/maintenances/drivers - list users with role 'driver'
router.get('/drivers', controller.getDrivers);

// GET /api/admin/maintenances/summary/cost - aggregated cost summary
router.get('/summary/cost', controller.costSummary);

// POST /api/admin/maintenances - create new
// protect create route so req.user is available (and createdBy is set)
router.post('/', express.json(), authenticate, authorize('admin','staff','dispatcher'), controller.create);

module.exports = router;
