const express = require("express");
const router = express.Router();
const multer = require("multer");
const incidentController = require("../controllers/incidentController");
const { authenticate } = require("../middlewares/authMiddleware");

// ── Multer: keep files in memory so the service can stream them to Cloudinary ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 50 MB per file
 fileFilter: (_req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4"
  ];

  if (allowedTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  cb(new Error("Chỉ chấp nhận JPG, PNG, WEBP hoặc MP4."));
},
});

// ── Customer routes ────────────────────────────────────────────────────────────

// POST /incidents — report a new incident (up to 5 media files)
router.post(
  "/",
  authenticate,
  upload.array("file", 5),
  incidentController.createIncident
);

// GET /incidents/:id — view single incident
router.get("/incidents/:id", authenticate, incidentController.getIncidentById);

// ── Staff / Admin routes ───────────────────────────────────────────────────────

// GET /invoices/:invoiceId/incidents — list all incidents for an invoice
router.get(
  "/invoices/:invoiceId/incidents",
  authenticate,
  incidentController.getIncidentsByInvoice
);

// PATCH /incidents/:id/resolve — update status / add resolution
router.patch(
  "/incidents/:id/resolve",
 authenticate,
  incidentController.resolveIncident
);

module.exports = router;