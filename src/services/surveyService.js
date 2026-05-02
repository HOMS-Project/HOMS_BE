/**
 * SurveyService - Quản lý khảo sát
 */

const SurveyData = require('../models/SurveyData');
const RequestTicket = require('../models/RequestTicket');
const AppError = require('../utils/appErrors');
const PricingCalculationService = require('./pricingCalculationService');
const NotificationService = require("./notificationService");
const T = require("../utils/notificationTemplates");
const RecommendationService = require('./recommendationService');
const PricingAdjustmentService = require('./pricingAdjustmentService');
const { getIo } = require("../utils/socket");

const TicketStateMachine = require('./TicketStateMachine');

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

    // Cập nhật SurveyData đã được khởi tạo từ lúc tạo ticket
    const survey = await SurveyData.findOneAndUpdate(
      { requestTicketId },
      {
        $set: {
          surveyType,
          scheduledDate: schedDate,
          surveyorId,
          status: 'SCHEDULED',
          notes
        }
      },
      { new: true, upsert: true }
    );

    // Cập nhật trạng thái ticket: CREATED -> WAITING_SURVEY
    await TicketStateMachine.transition(ticket, 'WAITING_SURVEY', {
      payload: { dispatcherId: surveyorId }
    });

    const io = getIo();
    await NotificationService.createNotification(
      {
        userId: ticket.customerId,
        ...T.SURVEY_SCHEDULED({ scheduledDate: schedDate.toLocaleString('vi-VN') }),
        ticketId: ticket._id
      },
      io
    );
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

    const allowedStatuses = ['WAITING_SURVEY', 'WAITING_REVIEW', 'SURVEYED'];
    if (ticket.moveType === 'TRUCK_RENTAL') {
      allowedStatuses.push('CREATED');
    }

    if (!allowedStatuses.includes(ticket.status)) {
      throw new AppError(
        `Không thể hoàn tất từ trạng thái ${ticket.status}. Phải là ${allowedStatuses.join(', ')}`,
        400
      );
    }

    // 2️⃣ Destructure đúng field mới
    const {
      suggestedVehicle,
      suggestedVehicles,
      suggestedStaffCount,
      distanceKm,
      carryMeter = 0,
      floors = 0,
      hasElevator = false,
      needsAssembling = false,
      needsPacking = false,
      insuranceRequired = false,
      declaredValue = 0,
      estimatedHours,
      items,
      images,
      notes
    } = surveyData;

    // Validate
    if ((!suggestedVehicle && (!suggestedVehicles || suggestedVehicles.length === 0)) || suggestedStaffCount == null) {
      throw new AppError('Thiếu dữ liệu khảo sát bắt buộc', 400);
    }

    if (ticket.moveType !== 'TRUCK_RENTAL' && distanceKm == null) {
      throw new AppError('Thiếu khoảng cách vận chuyển', 400);
    }

    // 3️⃣ Tính toán totals
    let totalActualWeight = 0;
    let totalActualVolume = 0;
    let totalActualItems = 0;

    if (items && Array.isArray(items)) {
      totalActualItems = items.length;
      items.forEach(item => {
        totalActualWeight += item.actualWeight || 0;
        totalActualVolume += item.actualVolume || 0;
      });
    }

    // 4️⃣ Update survey với Upsert (đảm bảo 1-to-1 relationship)
    const updateData = {
      $set: {
        status: 'COMPLETED',
        completedDate: new Date(),
        suggestedVehicle,
        suggestedVehicles,
        suggestedStaffCount,
        distanceKm,
        carryMeter,
        floors,
        hasElevator,
        needsAssembling,
        needsPacking,
        insuranceRequired,
        declaredValue,
        estimatedHours,
      },
      $setOnInsert: {
        surveyType: 'ONLINE',
        scheduledDate: new Date(),
        surveyorId: userId || ticket.dispatcherId,
      }
    };

    if (items && Array.isArray(items)) {
      updateData.$set.items = items;
      updateData.$set.totalActualItems = totalActualItems;
      updateData.$set.totalActualWeight = totalActualWeight;
      updateData.$set.totalActualVolume = totalActualVolume;
    }

    if (images && Array.isArray(images)) {
      updateData.$set.images = images;
    }

    if (notes) {
      updateData.$set.notes = notes;
    }

    const freshSurvey = await SurveyData.findOneAndUpdate(
      { requestTicketId: ticket._id },
      updateData,
      { new: true, upsert: true }
    );

    // ========== 5️⃣ TÍNH GIÁ ==========
    const priceList = await PricingCalculationService.getActivePriceList();

    // 5.1 Calculate Base Pricing
    const basePricing = await PricingCalculationService.calculatePricing(
      freshSurvey,
      priceList,
      ticket.moveType
    );

    // 5.2 Get Recommendations (Weighted Score + Time Slot + Distance Factor)
    let recommendation = null;
    try {
      const moveDate = ticket.scheduledTime;
      const location = ticket.pickup?.address || 'Ho Chi Minh City';
      const distanceKm = freshSurvey.distanceKm || 0;
      recommendation = await RecommendationService.getRecommendations(moveDate, location, distanceKm);
    } catch (recError) {
      console.error('Recommendation Error:', recError.message);
    }

    // 5.3 Apply Dynamic Adjustments
    const finalPricingResult = recommendation
      ? await PricingAdjustmentService.applyAdjustments(basePricing, recommendation)
      : basePricing;

    const pricingData = await PricingCalculationService.createPricingData(
      requestTicketId,
      freshSurvey,
      finalPricingResult,
      userId
    );

    // ========== 6️⃣ Update ticket thành QUOTED ==========
    await TicketStateMachine.transition(ticket, 'QUOTED', {
      userId,
      payload: { pricing: pricingData }
    });
const io = getIo();
    await NotificationService.createNotification(
      {
        userId: ticket.customerId,
        ...T.QUOTE_READY({ ticketCode: ticket.code }),
        ticketId: ticket._id
      },
      io
    );
    if (io) {
      const socketId = global.onlineUsers?.get(ticket.customerId.toString());
      if (socketId) {
        io.to(socketId).emit("ticket_updated", { ticketId: ticket._id });
      }
    }
    return {
      survey: freshSurvey,
      pricing: pricingData
    };
  }

  /**
   * Xem trước giá (không lưu)
   */
  async previewPricing(requestTicketId, surveyData) {
    const ticket = await RequestTicket.findById(requestTicketId);
    if (!ticket) throw new AppError('Ticket không tồn tại', 404);

    const priceList = await PricingCalculationService.getActivePriceList();

    // 1. Tính giá cơ sở
    const basePricing = await PricingCalculationService.calculatePricing(
      surveyData,
      priceList,
      ticket.moveType
    );

    // 2. Lấy gợi ý & điều chỉnh (nếu có)
    let recommendation = null;
    try {
      const moveDate = ticket.scheduledTime || new Date();
      const location = ticket.pickup?.address || 'Ho Chi Minh City';
      const distanceKm = surveyData.distanceKm || 0;
      recommendation = await RecommendationService.getRecommendations(moveDate, location, distanceKm);
    } catch (e) { console.error(e); }

    const finalPricingResult = recommendation
      ? await PricingAdjustmentService.applyAdjustments(basePricing, recommendation)
      : basePricing;

    return finalPricingResult;
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
   * Lấy khảo sát theo request ticket.
   */
  async getSurveyByTicket(requestTicketId) {
    const survey = await SurveyData.findOne({ requestTicketId })
      .populate('surveyorId', 'fullName email phone');

    if (survey) {
      return survey;
    }

    const ticket = await RequestTicket.findById(requestTicketId);
    if (!ticket) {
      throw new AppError('Không tìm thấy ticket', 404);
    }

    if (ticket.status === 'WAITING_SURVEY') {
      console.warn(`[getSurveyByTicket] Healing: Creating missing SurveyData for ticket ${requestTicketId}`);
      const newSurvey = new SurveyData({
        requestTicketId: ticket._id,
        surveyType: 'ONLINE',
        status: 'SCHEDULED',
        surveyorId: ticket.dispatcherId || null,
        scheduledDate: ticket.scheduledTime || new Date()
      });
      await newSurvey.save();
      return newSurvey;
    }

    throw new AppError('Không tìm thấy dữ liệu khảo sát cho ticket này.', 404);
  }

  /**
   * Tính toán ước lượng: loại xe, số nhân viên, thời gian làm việc dựa trên workload
   */
  async estimateResources({ items, distanceKm = 0, floors = 0, hasElevator = false, carryMeter = 0, needsAssembling = false, needsPacking = false }) {
    const ITEM_BASELINES = {
      chair:      { volume: 0.3, weight: 5, category: 'default' },
      table:      { volume: 1.2, weight: 20, category: 'bulky' },
      sofa:       { volume: 2.5, weight: 50, category: 'bulky' },
      bed:        { volume: 3.0, weight: 60, category: 'bulky' },
      wardrobe:   { volume: 4.0, weight: 80, category: 'bulky' },
      fridge:     { volume: 2.0, weight: 70, category: 'heavy' },
      washing_machine: { volume: 1.5, weight: 60, category: 'heavy' },
      tv:         { volume: 0.5, weight: 10, category: 'default' },
      piano:      { volume: 3.5, weight: 250, category: 'heavy' },
      safe:       { volume: 1.0, weight: 300, category: 'heavy' },
      desk:       { volume: 1.5, weight: 30, category: 'bulky' },
      bookshelf:  { volume: 2.5, weight: 45, category: 'bulky' },
      microwave:  { volume: 0.8, weight: 20, category: 'default' },
      mattress:   { volume: 2.0, weight: 25, category: 'bulky' },
      box_small:  { volume: 0.1, weight: 5, category: 'default' },
      box_medium: { volume: 0.2, weight: 15, category: 'default' },
      box_large:  { volume: 0.4, weight: 30, category: 'default' },
      default:    { volume: 0.5, weight: 10, category: 'default' }
    };

    const BASE_HANDLING = {
      default: 0.5,
      bulky: 0.8,
      heavy: 1.2
    };

    let reasons = [];
    
    // 1. Normalization Layer
    let normalizedItems = [];
    if (items && Array.isArray(items)) {
      normalizedItems = items.map(item => {
        let volume = item.actualVolume;
        let weight = item.actualWeight;
        let category = item.category || 'default';
        let source = item.source || 'USER';

        if (!volume || !weight) {
          const key = (item.type || item.name || 'default').toLowerCase().replace(/\s+/g, '_');
          const base = ITEM_BASELINES[key] || ITEM_BASELINES.default;
          volume = volume || base.volume;
          weight = weight || base.weight;
          category = base.category;
        }

        return { ...item, actualVolume: volume, actualWeight: weight, category, source };
      });
    }

    // 2. Workload Calculation TÁCH BIỆT TRỊ SỐ BÊ VÁC VÀ DỊCH VỤ
    let transportWorkload = 0;
    let serviceWorkload = 0;   
    let totalVolume = 0;
    let totalWeight = 0;

    normalizedItems.forEach(item => {
      totalVolume += item.actualVolume;
      totalWeight += item.actualWeight;

      let baseHandling = (BASE_HANDLING[item.category] || BASE_HANDLING.default) + item.actualVolume;
      
      if (item.actualWeight > 100) baseHandling *= 2;
      if (item.actualWeight > 200) baseHandling *= 3;
      if (item.isSpecialItem || item.condition === 'FRAGILE') baseHandling *= 1.5;
      if (item.requiresManualHandling) baseHandling *= 1.2;

      transportWorkload += baseHandling;
    });

    // Tính điểm dịch vụ (Cộng thẳng, không bị nhân hệ số tầng sau này)
    if (needsPacking) {
      serviceWorkload += normalizedItems.length * 0.5;
      reasons.push({ type: 'SERVICE', message: 'Packing service increases handling time', impact: 'MEDIUM' });
    }

    if (needsAssembling) {
      serviceWorkload += normalizedItems.length * 0.7;
      reasons.push({ type: 'SERVICE', message: 'Assembly/disassembly required', impact: 'HIGH' });
    }

    // Interaction penalty chỉ áp dụng cho lúc khuân vác
    let interactionPenalty = 1;
    if (normalizedItems.length > 5 && normalizedItems.some(i => i.category === 'heavy')) {
      interactionPenalty = 1.1;
    }
    transportWorkload *= interactionPenalty;

    // Multipliers Stack
    let riskBuffer = 1;
    if (normalizedItems.length > 0) {
      if (!normalizedItems.some(i => i.actualWeight > 100)) riskBuffer += 0.1;
      if (normalizedItems.length > 10) riskBuffer += Math.min(0.2, normalizedItems.length * 0.01);
      
      const aiCount = normalizedItems.filter(i => i.source === 'AI').length;
      if (aiCount === normalizedItems.length) {
        riskBuffer += 0.05;
      } else if (aiCount > 0) {
        riskBuffer += 0.05;
      }
    }

    const carryFactor = 1 + (carryMeter / 100);
    if (carryMeter > 50) reasons.push({ type: 'CARRY', message: 'Long carrying distance increases workload', impact: 'MEDIUM' });

    let floorFactor = hasElevator ? (1 + floors * 0.15) : (1 + floors * 0.5);
    if (floorFactor > 3) floorFactor = 3 + (floorFactor - 3) * 0.3; // Soft cap
    
    if (floors > 3 && !hasElevator) {
      reasons.push({ type: 'FLOOR', message: 'High floor without elevator significantly increases effort', impact: 'HIGH' });
    }

    const MAX_TOTAL_MULTIPLIER = 4.0;

    let totalMultiplier = Math.min(floorFactor * carryFactor * riskBuffer, MAX_TOTAL_MULTIPLIER);
    transportWorkload = transportWorkload * totalMultiplier;


    serviceWorkload = serviceWorkload * riskBuffer; 
    let workload = Math.round((transportWorkload + serviceWorkload) * 100) / 100;

    // 3. Vehicle Suggestion 
    let suggestedVehicle = '500KG';
    let vehicleCapacity = 3; // base volume capacity

    if (totalWeight > 1500 || totalVolume > 8) { suggestedVehicle = '2TON'; vehicleCapacity = 12; }
    else if (totalWeight > 1000 || totalVolume > 5) { suggestedVehicle = '1.5TON'; vehicleCapacity = 8; }
    else if (totalWeight > 500 || totalVolume > 2.5) { suggestedVehicle = '1TON'; vehicleCapacity = 5; }
    
    if (normalizedItems.some(i => i.isOversized || i.actualVolume > 2.5) && suggestedVehicle === '500KG') {
      suggestedVehicle = '1TON';
      vehicleCapacity = 5;
    }

    let trips = 1;
    if (totalVolume > vehicleCapacity) trips = Math.ceil(totalVolume / vehicleCapacity);

    const routeWarnings = [];
    if (suggestedVehicle === '2TON' || suggestedVehicle === '1.5TON') {
      routeWarnings.push(`Lưu ý: Xe ${suggestedVehicle} có thể bị cấm tải trong giờ cao điểm nội thành.`);
    }

    // 4. Time Conversion & Staff Estimation
    const WORKLOAD_TO_MINUTES = process.env.WORKLOAD_TO_MINUTES || 12;
    const estimatedMinutes = Math.round(workload * WORKLOAD_TO_MINUTES);
    
    let suggestedStaffCount = 2; // Min staff
    if (workload >= 18) suggestedStaffCount = 5;
    else if (workload >= 10) suggestedStaffCount = 4;
    else if (workload >= 5) suggestedStaffCount = 3;

    if (normalizedItems.some(i => i.actualWeight > 200)) suggestedStaffCount = Math.max(suggestedStaffCount, 3);
      const MAX_STAFF_OVERALL = 6; 
    suggestedStaffCount = Math.min(suggestedStaffCount, MAX_STAFF_OVERALL);


    if (suggestedStaffCount > 3 && (suggestedVehicle === '500KG' || suggestedVehicle === '1TON')) {
      reasons.push({ 
        type: 'LOGISTICS', 
        message: `Đơn hàng cần ${suggestedStaffCount} nhân công nhưng xe ${suggestedVehicle} chỉ ngồi được 2-3 người. Thợ phụ cần chủ động đi xe máy riêng.`, 
        impact: 'LOW' 
      });
    }

    // 5. Confidence Level
    let confidenceLevel = 'HIGH';
    if (normalizedItems.length > 0) {
      const aiRatio = normalizedItems.filter(i => i.source === 'AI').length / normalizedItems.length;
      if (aiRatio >= 0.5) confidenceLevel = 'LOW';
      else if (aiRatio > 0) confidenceLevel = 'MEDIUM';
    }

    console.log('[estimateResources Debug]', JSON.stringify({
      workload,
      transportWorkload,
      serviceWorkload,
      multipliers: { riskBuffer, carryFactor, floorFactor, interactionPenalty, totalMultiplier },
      estimatedMinutes,
      staff: suggestedStaffCount,
      vehicle: `${suggestedVehicle} (x${trips})`,
      reasonsCount: reasons.length
    }, null, 2));

    return {
      suggestedVehicle,
      trips,
      suggestedStaffCount,
      totalVolume,
      totalWeight,
      workload,
      estimatedMinutes,
      confidenceLevel,
      routeWarnings,
      distanceKm,
      reasons,
      debug: {
        normalizedItems,
        workloadBreakdown: { transportWorkload, serviceWorkload, interactionPenalty, riskBuffer, carryFactor, floorFactor, totalMultiplier }
      }
    };
  }
}

module.exports = new SurveyService();