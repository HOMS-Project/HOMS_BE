/**
 * SurveyController - API handlers cho khảo sát
 */

const SurveyService = require('../services/surveyService');
const AppError = require('../utils/appErrors');

/**
 * POST /api/surveys/schedule
 * Lên lịch khảo sát cho request ticket
 */
exports.scheduleSurvey = async (req, res, next) => {
  try {
    const { requestTicketId, surveyType, scheduledDate, notes, surveyorId: bodySurveyorId } = req.body;
    const surveyorId = bodySurveyorId || req.user.userId || req.user._id || req.user.id;

    if (!surveyorId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    if (!requestTicketId || !surveyType || !scheduledDate) {
      throw new AppError('Thiếu dữ liệu bắt buộc', 400);
    }

    const survey = await SurveyService.scheduleSurvey(
      requestTicketId,
      surveyType,
      scheduledDate,
      surveyorId,
      notes,
    );

    res.status(201).json({
      success: true,
      message: 'Khảo sát đã được lên lịch',
      data: survey
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/surveys/estimate
 * Ước tính tài nguyên xe tải và nhân viên dựa trên đồ đạc và khoảng cách
 */
exports.estimateResources = async (req, res, next) => {
  try {
    const { items, distanceKm, floors, hasElevator } = req.body;

    if (distanceKm == null || floors == null) {
      throw new AppError('Thiếu thông báo khoảng cách hoặc số tầng', 400);
    }

    const estimate = await SurveyService.estimateResources({
      items,
      distanceKm: Number(distanceKm),
      floors: Number(floors),
      hasElevator: Boolean(hasElevator)
    });

    res.json({
      success: true,
      message: 'Tính toán tài nguyên thành công',
      data: estimate
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/surveys/:ticketId/complete
 * Hoàn tất khảo sát & tính giá tự động
 */
exports.completeSurvey = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    // ✅ Guard req.body
    if (!req.body || typeof req.body !== 'object') {
      throw new AppError('Request body không hợp lệ', 400);
    }

    const surveyData = req.body;
    const userId = req.user.userId || req.user._id || req.user.id;

    // ✅ Guard user
    if (!userId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    // ✅ Validate bắt buộc (an toàn undefined)
    if (!surveyData?.suggestedVehicle && (!surveyData?.suggestedVehicles || surveyData.suggestedVehicles.length === 0)) {
      throw new AppError('Thiếu loại xe đề xuất', 400);
    }

    if (!surveyData?.suggestedStaffCount) {
      throw new AppError('Thiếu số nhân viên đề xuất', 400);
    }

    // ✅ Gọi service
    const result = await SurveyService.completeSurvey(
      ticketId,
      surveyData,
      userId
    );

    return res.status(200).json({
      success: true,
      message: 'Khảo sát hoàn tất & giá đã được tính',
      data: {
        survey: result?.survey || null,
        pricing: result?.pricing || null
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/surveys/:surveyId
 * Lấy chi tiết khảo sát
 */
exports.getSurvey = async (req, res, next) => {
  try {
    const { surveyId } = req.params;

    const survey = await SurveyService.getSurvey(surveyId);

    res.json({
      success: true,
      data: survey
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/surveys/ticket/:ticketId
 * Lấy khảo sát của ticket
 */
exports.getSurveyByTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    const survey = await SurveyService.getSurveyByTicket(ticketId);

    res.json({
      success: true,
      data: survey
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/surveys/:ticketId/preview-pricing
 */
exports.previewPricing = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const result = await SurveyService.previewPricing(ticketId, req.body);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};
