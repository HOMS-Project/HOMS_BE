const express = require('express');
const router = express.Router();
const adminIncidentController = require('../../controllers/admin/incidentController');
const { ensureAdmin } = require('../../middlewares/authMiddleware') || ((req,res,next)=>next());

// GET /api/admin/incidents
router.get('/', /*ensureAdmin,*/ adminIncidentController.listIncidents);

// GET /api/admin/incidents/:id
router.get('/:id', /*ensureAdmin,*/ adminIncidentController.getIncident);

// PATCH /api/admin/incidents/:id/resolve
router.patch('/:id/resolve', /*ensureAdmin,*/ adminIncidentController.resolveIncident);

module.exports = router;
