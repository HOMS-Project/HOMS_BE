/**
 * SurveyService - Quản lý khảo sát
 */

const SurveyData = require('../models/SurveyData');
const RequestTicket = require('../models/RequestTicket');
const AppError = require('../utils/appErrors');
const PricingCalculationService = require('./pricingCalculationService');
const NotificationService = require("./notificationService");
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
      title: "Lịch khảo sát đã được xác nhận",
      message: `Khảo sát được lên lịch vào ${schedDate.toLocaleString()}`,
      type: "System",
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

    if (!['WAITING_SURVEY', 'WAITING_REVIEW'].includes(ticket.status)) {
      throw new AppError(
        `Không thể hoàn tất từ trạng thái ${ticket.status}. Phải là WAITING_SURVEY hoặc WAITING_REVIEW`,
        400
      );
    }

    // 2️⃣ Destructure đúng field mới
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
      estimatedHours,
      items,
      notes
    } = surveyData;

    // Validate
    if (!suggestedVehicle || suggestedStaffCount == null || distanceKm == null) {
      throw new AppError('Thiếu dữ liệu khảo sát bắt buộc', 400);
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
    await TicketStateMachine.transition(ticket, 'QUOTED', {
      userId,
      payload: { pricing: pricingData }
    });

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
   * Lấy khảo sát theo request ticket.
   * For WAITING_REVIEW tickets (SPECIFIC_ITEMS / TRUCK_RENTAL): if no SurveyData exists yet,
   * return a synthetic object built from ticket.items so the dispatcher form can pre-populate.
   */
  async getSurveyByTicket(requestTicketId) {
    const survey = await SurveyData.findOne({ requestTicketId })
      .populate('surveyorId', 'fullName email phone');

    if (survey) {
      return survey;
    }

    // If no survey is found, it's an error because one should have been created with the ticket
    // for SPECIFIC_ITEMS/TRUCK_RENTAL, or scheduled for FULL_HOUSE.
    const ticket = await RequestTicket.findById(requestTicketId);
    if (!ticket) {
      throw new AppError('Không tìm thấy ticket', 404);
    }
    
    // This case should ideally not be reached if the flow is correct.
    // It indicates a state inconsistency.
    console.warn(`[getSurveyByTicket] No SurveyData found for ticket ${requestTicketId} with status ${ticket.status}. This might indicate an issue.`);
    throw new AppError('Không tìm thấy dữ liệu khảo sát cho ticket này.', 404);
  }

  /**
   * Tính toán ước lượng: loại xe, số nhân viên cơ bản dựa trên items
   */
  async estimateResources(items, distanceKm, floors, hasElevator) {
    let totalVolume = 0;
    let totalWeight = 0;

    if (items && Array.isArray(items)) {
      items.forEach(item => {
        totalVolume += (item.actualVolume || 0);
        totalWeight += (item.actualWeight || 0);
      });
    }

    // Xác định loại xe dựa trên Volume & Weight
    let suggestedVehicle = '500KG';
    if (totalWeight > 1000 || totalVolume > 5) {
      suggestedVehicle = '1.5TON';
    } else if (totalWeight > 500 || totalVolume > 2.5) {
      suggestedVehicle = '1TON';
    }

    if (totalWeight > 1500 || totalVolume > 8) {
      suggestedVehicle = '2TON';
    }

    // Đề xuất nhân viên cơ bản
    let suggestedStaffCount = 2;
    if (totalVolume > 5 || totalWeight > 500) suggestedStaffCount += 1;
    if (floors > 2 && !hasElevator) suggestedStaffCount += 1;
    if (suggestedStaffCount > 5) suggestedStaffCount = 5;

    // Check luật giao thông
    const routeWarnings = [];
    if (suggestedVehicle === '2TON' || suggestedVehicle === '1.5TON') {
      routeWarnings.push(`Lưu ý: Xe ${suggestedVehicle} có thể bị cấm tải trong giờ cao điểm nội thành.`);
    }

    return {
      suggestedVehicle,
      suggestedStaffCount,
      totalVolume,
      totalWeight,
      distanceKm,
      routeWarnings
    };
  }
}
module.exports = new SurveyService();
