const express = require("express");
const router = express.Router();

const notificationController = require("../controllers/notificationController");
const { authenticate,authorize } = require("../middlewares/authMiddleware");

router.get("/",authenticate, authorize('CUSTOMER', 'DISPATCHER'), notificationController.getNotifications);

router.patch("/:id/read",authenticate, authorize('CUSTOMER', 'DISPATCHER'), notificationController.markNotificationRead);

module.exports = router;