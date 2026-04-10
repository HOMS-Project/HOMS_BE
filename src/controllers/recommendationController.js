const RecommendationService = require('../services/recommendationService');

/**
 * Public endpoint: AI-powered "Best moving day" suggestion
 * Uses the Excellent Tier recommendation engine (weather, traffic, demand, business intent)
 * to evaluate the requested move time and suggest better alternatives.
 */
exports.getBestMovingTime = async (req, res, next) => {
  try {
    const { scheduledDate, pickupAddress, distanceKm, moveType, rentalDetails } = req.body || {};

    if (!scheduledDate || !pickupAddress || distanceKm == null) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp đầy đủ scheduledDate, pickupAddress và distanceKm'
      });
    }

    const parsedDate = new Date(scheduledDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'scheduledDate không hợp lệ'
      });
    }

    const distance = Number(distanceKm);
    if (!Number.isFinite(distance) || distance <= 0) {
      return res.status(400).json({
        success: false,
        message: 'distanceKm phải là số dương'
      });
    }

    // Call core RecommendationService (Excellent Tier engine)
    const recommendation = await RecommendationService.getRecommendations(
      parsedDate,
      pickupAddress,
      distance,
      moveType,
      rentalDetails
    );

    return res.status(200).json({
      success: true,
      data: recommendation
    });
  } catch (error) {
    next(error);
  }
};
