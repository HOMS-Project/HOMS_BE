/**
 * Service xử lý khảo sát
 * - Tạo/cập nhật khảo sát
 * - Tính toán dữ liệu thực tế sau khảo sát
 * - Kiểm tra nhu cầu định giá lại
 */

const SurveyData = require('../models/SurveyData');
const PricingData = require('../models/PricingData');
const AppError = require('../utils/appErrors');

class SurveyService {
  /**
   * Tạo khảo sát cho invoice
   */
  async createSurvey(invoiceId, surveyData) {
    try {
      const survey = new SurveyData({
        invoiceId,
        surveyType: surveyData.surveyType,
        scheduledDate: surveyData.scheduledDate,
        surveyorId: surveyData.surveyorId
      });

      await survey.save();
      return survey;
    } catch (error) {
      throw new AppError('Failed to create survey', 400);
    }
  }

  /**
   * Hoàn thành khảo sát offline/online
   * Tính toán weight, volume thực tế
   */
  async completeSurvey(surveyId, surveyItems) {
    try {
      const survey = await SurveyData.findById(surveyId);
      if (!survey) {
        throw new AppError('Survey not found', 404);
      }

      // Cập nhật items
      survey.items = surveyItems.map(item => ({
        itemId: item.itemId,
        actualWeight: item.actualWeight || 0,
        actualDimensions: item.actualDimensions,
        actualVolume: this.calculateVolume(item.actualDimensions),
        condition: item.condition || 'GOOD',
        notes: item.notes
      }));

      // Tính toán tổng
      survey.totalActualWeight = this.calculateTotalWeight(survey.items);
      survey.totalActualVolume = this.calculateTotalVolume(survey.items);
      survey.totalActualItems = survey.items.length;

      // Cập nhật accessibility info
      if (surveyItems.accessibility) {
        survey.accessibility = surveyItems.accessibility;
      }

      survey.status = 'COMPLETED';
      survey.completedDate = new Date();
      survey.needsRepricing = true;

      await survey.save();
      return survey;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Tính volume từ dimensions
   */
  calculateVolume(dimensions) {
    if (!dimensions || !dimensions.length || !dimensions.width || !dimensions.height) {
      return 0;
    }
    // Chuyển từ cm sang m3
    return (dimensions.length * dimensions.width * dimensions.height) / 1_000_000;
  }

  /**
   * Tính tổng weight
   */
  calculateTotalWeight(items) {
    return items.reduce((sum, item) => sum + (item.actualWeight || 0), 0);
  }

  /**
   * Tính tổng volume
   */
  calculateTotalVolume(items) {
    return items.reduce((sum, item) => sum + (item.actualVolume || 0), 0);
  }

  /**
   * Lấy khảo sát theo invoice
   */
  async getSurveyByInvoice(invoiceId) {
    return SurveyData.findOne({ invoiceId }).populate('surveyorId');
  }

  /**
   * Kiểm tra xem khảo sát đã hoàn thành chưa
   */
  async isSurveyCompleted(invoiceId) {
    const survey = await this.getSurveyByInvoice(invoiceId);
    return survey && survey.status === 'COMPLETED';
  }
}

module.exports = new SurveyService();
