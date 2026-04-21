/**
 * Routes cho Survey
 */

const express = require('express');
const router = express.Router();
const surveyController = require('../controllers/surveyController');
const { authenticate } = require('../middlewares/authMiddleware');

/**
 * SURVEY ENDPOINTS
 */

// POST /api/surveys/schedule - Lên lịch khảo sát
router.post(
  '/schedule',
  authenticate,
  surveyController.scheduleSurvey
);

// POST /api/surveys/estimate - Ước tính tài nguyên
router.post(
  '/estimate',
  authenticate,
  surveyController.estimateResources
);

// PUT /api/surveys/:ticketId/complete - Hoàn tất khảo sát
router.put(
  '/:ticketId/complete',
  authenticate,
  surveyController.completeSurvey
);

// POST /api/surveys/:ticketId/preview-pricing - Xem trước giá
router.post(
  '/:ticketId/preview-pricing',
  authenticate,
  surveyController.previewPricing
);

// GET /api/surveys/ticket/:ticketId - Lấy khảo sát của ticket (must be before /:surveyId)
router.get(
  '/ticket/:ticketId',
  authenticate,
  surveyController.getSurveyByTicket
);

// GET /api/surveys/:surveyId - Lấy chi tiết khảo sát
router.get(
  '/:surveyId',
  authenticate,
  surveyController.getSurvey
);

module.exports = router;
