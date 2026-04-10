const express = require("express");
const router = express.Router();
const aiAdminController = require("../../controllers/admin/aiAdminController");
const { verifyToken, authorize } = require("../../middlewares/authMiddleware");

// All routes here are protected and restricted to admin/dispatcher
router.use(verifyToken);
router.use(authorize("admin", "dispatcher"));

router.get("/business-insight", aiAdminController.getBusinessInsight);
router.post("/generate-template-content", aiAdminController.generateTemplateContent);
router.get("/feedback-summary", aiAdminController.getFeedbackSummary);
router.get("/promotion-advice", aiAdminController.getPromotionAdvice);

module.exports = router;
