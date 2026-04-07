const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/maintenanceController');

// GET /api/admin/maintenances - list all
router.get('/', controller.getAll);

// GET /api/admin/maintenances/summary/cost - aggregated cost summary
router.get('/summary/cost', controller.costSummary);

// POST /api/admin/maintenances - create new
router.post('/', express.json(), controller.create);

module.exports = router;
