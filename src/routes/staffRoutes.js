const express = require("express");
const router = express.Router();
const multer = require("multer");
const staffController = require("../controllers/staffController");
const staffIncidentController = require("../controllers/staffIncidentController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

// Multer in-memory storage for Cloudinary uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "video/mp4"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Chỉ chấp nhận JPG, PNG, WEBP hoặc MP4."));
  },
});

// Tất cả các routes này yêu cầu đăng nhập
router.use(authenticate);

// Staff list their assigned orders
router.get("/orders", staffController.getAssignedOrders);

// Get detail of a specific order
router.get("/orders/:invoiceId", staffController.getOrderDetails);

// Staff starts moving job and triggers customer email notification
router.put("/orders/:id/start", staffController.startOrder);

// Staff completes moving job and triggers customer email notification
router.put("/orders/:id/complete", staffController.completeOrder);

// Proxy OSRM route for mobile map (fixes network errors)
router.get("/routing/osrm", staffController.getProxyRoute);

// Upload pre-trip pickup evidence (images + note)
router.post(
  "/orders/:invoiceId/pickup",
  upload.array("images", 10),
  staffController.submitPickupProof,
);

// Upload dropoff/completion evidence (images + note)
router.post(
  "/orders/:invoiceId/dropoff",
  upload.array("images", 10),
  staffController.submitDropoffProof,
);

// Update status of a specific assignment
router.patch(
  "/assignments/:assignmentId/status",
  staffController.updateAssignmentStatus,
);

// Update route of a specific assignment
router.patch(
  "/assignments/:assignmentId/route",
  staffController.updateAssignmentRoute,
);

// Incident metadata for report form
router.get("/incidents/meta/types", staffIncidentController.getIncidentTypes);

// Driver/staff incident reports
router.get("/incidents", staffIncidentController.getMyIncidents);
router.post(
  "/incidents",
  upload.array("file", 5),
  staffIncidentController.createIncident,
);

module.exports = router;
