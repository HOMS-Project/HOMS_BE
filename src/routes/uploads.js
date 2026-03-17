const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');

// GET /api/uploads/presign?filename=...&contentType=...
router.get('/presign', uploadController.getPresignUrl);

// POST /api/uploads/process  { key, bucket?, targetPrefix? }
router.post('/process', uploadController.processToHLS);

module.exports = router;
