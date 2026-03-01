/**
 * SurveyService - Quản lý khảo sát
 */

const SurveyData = require('../models/SurveyData');
const RequestTicket = require('../models/RequestTicket');
const AppError = require('../utils/appErrors');
const PricingCalculationService = require('./pricingCalculationService');

class SurveyService {
  /**
   * Lên lịch khảo sát
   * Chuyển status từ CREATED -> WAITING_SURVEY
   */
  async scheduleSurvey(requestTicketId, surveyType, scheduledDate, surveyorId, notes) {
    // Validate request ticket
    const ticket = await RequestTicket.findById(requestTicketId);
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    if (ticket.status !== 'CREATED') {
      throw new AppError(`Không thể lên lịch khảo sát từ trạng thái ${ticket.status}. Trạng thái phải là CREATED`, 400);
    }

    // Validate surveyType
    if (!['OFFLINE', 'ONLINE'].includes(surveyType)) {
      throw new AppError('Loại khảo sát không hợp lệ', 400);
    }

    // Validate scheduledDate
    const schedDate = new Date(scheduledDate);
    if (schedDate < new Date()) {
      throw new AppError('Ngày khảo sát phải trong tương lai', 400);
    }

    // Tạo SurveyData
    const survey = new SurveyData({
      requestTicketId,
      surveyType,
      scheduledDate: schedDate,
      surveyorId,
      status: 'SCHEDULED',
      notes
    });

    await survey.save();

    // Cập nhật trạng thái ticket: CREATED -> WAITING_SURVEY
    ticket.status = 'WAITING_SURVEY';
    ticket.dispatcherId = surveyorId;
    await ticket.save();

    return survey;
  }

  /**
   * Hoàn tất khảo sát & tính giá
   */
  async completeSurvey(requestTicketId, surveyData, userId) {

  // 1️⃣ Validate ticket
  const ticket = await RequestTicket.findById(requestTicketId);
  if (!ticket) {
    throw new AppError('Request ticket không tồn tại', 404);
  }

  if (ticket.status !== 'WAITING_SURVEY') {
    throw new AppError(
      `Không thể hoàn tất khảo sát từ trạng thái ${ticket.status}`,
      400
    );
  }

  // 2️⃣ Tìm survey
  const survey = await SurveyData.findOne({
    requestTicketId,
    status: 'SCHEDULED'
  });

  if (!survey) {
    throw new AppError('Không tìm thấy đợt khảo sát', 404);
  }

  // 3️⃣ Destructure đúng field mới
  const {
    suggestedVehicle,
    suggestedStaffCount,
    distanceKm,
    carryMeter = 0,
    floors = 0,
    hasElevator = false,
    needsAssembling = false,
    needsPacking = false,
    insuranceRequired = false,
    declaredValue = 0,
    items,
    notes
  } = surveyData;

  // Validate
  if (!suggestedVehicle || suggestedStaffCount == null || distanceKm == null) {
    throw new AppError('Thiếu dữ liệu khảo sát bắt buộc', 400);
  }

  // 4️⃣ Update survey
  survey.suggestedVehicle  = suggestedVehicle;
  survey.suggestedStaffCount = suggestedStaffCount;
  survey.distanceKm = distanceKm;
  survey.carryMeter = carryMeter;
  survey.floors = floors;
  survey.hasElevator = hasElevator;
  survey.needsAssembling = needsAssembling;
  survey.needsPacking = needsPacking;
  survey.insuranceRequired = insuranceRequired;
  survey.declaredValue = declaredValue;

  if (items && Array.isArray(items)) {
    survey.items = items;
    survey.totalActualItems = items.length;

    let totalWeight = 0;
    let totalVolume = 0;

    items.forEach(item => {
      totalWeight += item.actualWeight || 0;
      totalVolume += item.actualVolume || 0;
    });

    survey.totalActualWeight = totalWeight;
    survey.totalActualVolume = totalVolume;
  }

  survey.completedDate = new Date();
  survey.status = 'COMPLETED';
  survey.notes = notes || survey.notes;

  await survey.save();

  // ⚠️ RELOAD survey từ DB để đảm bảo tất cả fields được persist
  const freshSurvey = await SurveyData.findById(survey._id);

  // ========== 5️⃣ TÍNH GIÁ ==========
  const priceList = await PricingCalculationService.getActivePriceList();

  const pricingCalculation =
    await PricingCalculationService.calculatePricing(
      freshSurvey,
      priceList
    );

  const pricingData =
    await PricingCalculationService.createPricingData(
      requestTicketId,
      freshSurvey,
      pricingCalculation,
      userId
    );

  // ========== 6️⃣ Update ticket thành QUOTED ==========
  ticket.status = 'QUOTED';

  ticket.pricing = {
    pricingDataId: pricingData._id,
    subtotal: pricingData.subtotal,
    tax: pricingData.tax,
    totalPrice: pricingData.totalPrice,
    version: pricingData.version,
    quotedAt: new Date(),
    isFinalized: false
  };

  await ticket.save();

  return {
    survey: freshSurvey,
    pricing: pricingData
  };
}

  /**
   * Lấy chi tiết khảo sát
   */
  async getSurvey(surveyId) {
    const survey = await SurveyData.findById(surveyId)
      .populate('requestTicketId', 'code customerId')
      .populate('surveyorId', 'fullName email phone');

    if (!survey) {
      throw new AppError('Khảo sát không tồn tại', 404);
    }

    return survey;
  }

  /**
   * Lấy khảo sát theo request ticket
   */
  async getSurveyByTicket(requestTicketId) {
    const survey = await SurveyData.findOne({ requestTicketId })
      .populate('surveyorId', 'fullName email phone');

    if (!survey) {
      throw new AppError('Không tìm thấy khảo sát cho ticket này', 404);
    }

    return survey;
  }
}

module.exports = new SurveyService();
