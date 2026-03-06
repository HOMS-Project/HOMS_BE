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
router.put('/surveys/:ticketId/confirm'.authenticate,surveyController.scheduleSurvey) 
// PUT /api/surveys/:ticketId/complete - Hoàn tất khảo sát
router.put(
  '/:ticketId/complete',
  authenticate,
  surveyController.completeSurvey
);

// GET /api/surveys/:surveyId - Lấy chi tiết khảo sát
router.get(
  '/:surveyId',
  authenticate,
  surveyController.getSurvey
);

// GET /api/surveys/ticket/:ticketId - Lấy khảo sát của ticket
router.get(
  '/ticket/:ticketId',
  authenticate,
  surveyController.getSurveyByTicket
);

module.exports = router;
