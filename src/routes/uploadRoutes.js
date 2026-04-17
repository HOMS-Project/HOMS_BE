const express = require('express');
const router = express.Router();
const multer = require('multer');
const uploadController = require('../controllers/uploadController');
const { authenticate } = require('../middlewares/authMiddleware');

// Multer parsing configuration specifically for streaming file buffers securely
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB API fallback Limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "video/mp4", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) return cb(null, true);
    cb(new Error(" [uploadController] File format not allowed. Use JPG, PNG, WEBP, or MP4."));
  },
});

// GET /api/uploads/presign?filename=...&contentType=...
router.get('/presign', uploadController.getPresignUrl);

// POST /api/uploads/process  { key, bucket?, targetPrefix? }
router.post('/process', uploadController.processToHLS);

// POST /api/uploads/survey-media  (Receives Array of files directly)
// Allows up to 10 files per analysis request.
router.post(
  '/survey-media',
  authenticate,
  upload.any(), // Use any() to process whatever file field name is sent (e.g. 'media', 'file', 'files[]')
  uploadController.uploadSurveyMedia
);

module.exports = router;
