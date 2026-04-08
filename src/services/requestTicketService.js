/**
 * RequestTicketService - Business logic cho Request Ticket
 */

const RequestTicket = require('../models/RequestTicket');
const SurveyData = require('../models/SurveyData');
const Invoice = require("../models/Invoice")
const AppError = require('../utils/appErrors');
const PaymentService = require('../services/paymentService')
const payos = require("../config/payos");
const NotificationService = require("./notificationService");
const { getIo } = require("../utils/socket");
const GeocodeService = require('./geocodeService');
const StrategyFactory = require('./strategies/StrategyFactory');
const AutoAssignmentService = require('./AutoAssignmentService');
const TicketStateMachine = require('./TicketStateMachine');

// Using strategies for transition logic now. 
// Old STATE_TRANSITIONS moved/delegated to individual strategies.

class RequestTicketService {
  /**
   * Head Dispatcher approves a CREATED ticket.
   *
   * FULL_HOUSE           → WAITING_SURVEY  (surveyor assigned, survey scheduled separately)
   * SPECIFIC_ITEMS       → WAITING_REVIEW  (district dispatcher auto-assigned to review AI data + price)
   * TRUCK_RENTAL         → WAITING_REVIEW  (same as SPECIFIC_ITEMS)
   *
   * @param {string} ticketId
   * @param {string} approverId  - userId of the Head Dispatcher approving
   * @param {string} [surveyorId] - required for FULL_HOUSE (picked from approve modal)
   */
  async approveTicket(ticketId, approverId, surveyorId) {
    const ticket = await RequestTicket.findById(ticketId);
    if (!ticket) throw new AppError('Request ticket không tồn tại', 404);
    if (ticket.status !== 'CREATED') {
      throw new AppError(`Chỉ có thể duyệt đơn ở trạng thái CREATED. Hiện tại: ${ticket.status}`, 400);
    }

    const io = getIo();
    const strategy = StrategyFactory.getStrategy(ticket.moveType);

    return await strategy.handleApproval(ticket, approverId, { surveyorId }, io);
  }

  /**
   * Tạo request ticket mới
   */
  async createTicket(data, customerId) {
    // Evaluate strategy based on moveType
    const strategy = StrategyFactory.getStrategy(data.moveType);

    // Validate request using specific strategy rules
    strategy.validateCreate(data);

    // Generate code
    const count = await RequestTicket.countDocuments();
    const code = `REQ-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const ticket = new RequestTicket({
      code,
      customerId,
      moveType: data.moveType,
      rentalDetails: data.rentalDetails || undefined,
      pickup: data.pickup,
      delivery: data.delivery,
      scheduledTime: data.scheduledTime || null,
      status: 'CREATED',
      notes: data.notes || ''
    });

    await ticket.save();

    // Delegate to strategy for post-creation operations (like creating SurveyData)
    await strategy.handlePostCreation(ticket, data);

    // Enrich with districts via Goong reverse geocoding (non-blocking)
    try {
      const { pickupDistrict, deliveryDistrict } = await GeocodeService.resolveDistricts(
        data.pickup?.coordinates,
        data.delivery?.coordinates
      );
      if (pickupDistrict || deliveryDistrict) {
        if (pickupDistrict) ticket.pickup.district = pickupDistrict;
        if (deliveryDistrict) ticket.delivery.district = deliveryDistrict;
        await ticket.save();
        console.log(`[Ticket ${ticket.code}] Districts: pickup=${pickupDistrict}, delivery=${deliveryDistrict}`);
      }
    } catch (geoErr) {
      console.warn('[createTicket] Geocoding failed, districts not set:', geoErr.message);
    }

    return ticket;
  }

  /**
   * Hủy request ticket
   */
  async cancelTicket(ticketId, userId, reason) {
    const ticket = await RequestTicket.findById(ticketId);
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    await TicketStateMachine.transition(ticket, 'CANCELLED', {
      userId,
      payload: { reason }
    });

    return ticket;
  }

  /**
   * Dispatcher từ chối lịch khảo sát và đề xuất lịch mới
   */
  async proposeNewTime(ticketId, userId, proposedTimes, reason, surveyorId) {
    const ticket = await RequestTicket.findById(ticketId);
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    if (ticket.status !== 'CREATED' && ticket.status !== 'WAITING_SURVEY') {
      throw new AppError(`Không thể đề xuất lịch từ trạng thái ${ticket.status}`, 400);
    }

    // Cập nhật ngày đề xuất mới
    // (Lưu ý mảng này là mảng thời gian được Dispatcher chọn gửi lại cho Khách hàng)
    ticket.proposedSurveyTimes = proposedTimes.map(timeStr => new Date(timeStr));
    if (surveyorId) {
      ticket.dispatcherId = surveyorId;
    }
    // Ghi chú lý do từ chối (có thể lưu log vào timeline sau này nếu làm hệ thống Log)
    if (reason) {
      ticket.rescheduleReason = reason;
    }

    // Không chuyển status thành CANCELLED, giữ nguyên để Khách hàng có thể thao tác chọn lại lịch.
    await ticket.save();
    const io = getIo();
    await NotificationService.createNotification(
      {
        userId: ticket.customerId,
        title: "Dispatcher đề xuất đổi lịch khảo sát",
        message: "Dispatcher đã đề xuất thời gian khảo sát mới cho đơn của bạn",
        type: "System",
        ticketId: ticket._id
      },
      io
    );
    return ticket;
  }
  async acceptSurveyTime(ticketId, selectedTime) {

    const ticket = await RequestTicket.findById(ticketId);

    if (!ticket) {
      throw new AppError('Ticket không tồn tại', 404);
    }

    await TicketStateMachine.transition(ticket, 'WAITING_SURVEY', {
      payload: { scheduledTime: selectedTime }
    });

    return ticket;
  }
  async rejectSurveyTime(ticketId, userId, reason, proposedTime) {
    const ticket = await RequestTicket.findById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket không tồn tại', 404);
    }

    if (ticket.status !== 'WAITING_SURVEY') {
      throw new AppError('Chỉ có thể từ chối và đổi giờ khi đơn hàng đang chờ khảo sát', 400);
    }

    if (reason) ticket.rescheduleReason = reason;
    if (proposedTime) {
      ticket.proposedSurveyTimes.push(new Date(proposedTime));
    }

    // Xóa giờ cũ do khách không đồng ý
    ticket.scheduledTime = null;

    await ticket.save();

    // 1. Thông báo cho người trực tiếp phụ trách (nếu có)
    const io = getIo();
    const dispatcherIdsToNotify = new Set();

    if (ticket.dispatcherId) {
      dispatcherIdsToNotify.add(ticket.dispatcherId.toString());
    }

    // 2. Tìm và Thông báo cho tất cả Điều phối tổng (Head Dispatchers)
    try {
      const User = require('../models/User'); // Import model User
      const headDispatchers = await User.find({
        role: 'dispatcher',
        'dispatcherProfile.isGeneral': true
      }).select('_id');

      headDispatchers.forEach(hd => dispatcherIdsToNotify.add(hd._id.toString()));
    } catch (err) {
      console.error("Lỗi khi tìm Điều phối tổng để thông báo:", err);
    }

    // Gửi thông báo hàng loạt
    for (const dId of dispatcherIdsToNotify) {
      await NotificationService.createNotification(
        {
          userId: dId,
          title: "Khách hàng yêu cầu đổi giờ khảo sát",
          message: `Đơn ${ticket.code} đã được khách hàng yêu cầu đổi lịch: ${reason}`,
          type: "System",
          ticketId: ticket._id
        },
        io
      );
    }
    return ticket;
  }

  /**
   * Điều phối viên chấp nhận một trong các giờ mà khách đề xuất
   */
  async dispatcherAcceptTime(ticketId, selectedTime) {
    const ticket = await RequestTicket.findById(ticketId);
    if (!ticket) {
      throw new AppError('Ticket không tồn tại', 404);
    }

    if (ticket.status !== 'WAITING_SURVEY') {
      throw new AppError('Chỉ có thể chốt lịch khi đơn hàng đang ở trạng thái chờ khảo sát', 400);
    }

    // 1. Chốt giờ chính thức trong Ticket
    const officialTime = new Date(selectedTime);
    ticket.scheduledTime = officialTime;

    // 2. Cập nhật SurveyData tương ứng
    try {
      await SurveyData.findOneAndUpdate(
        { requestTicketId: ticket._id },
        { scheduledDate: officialTime },
        { new: true }
      );
    } catch (err) {
      console.warn("Không tìm thấy SurveyData để cập nhật giờ:", err.message);
    }

    // 3. Cập nhật lại chuỗi thời gian trong notes để UI (Dispatcher) hiển thị đúng
    if (ticket.notes && ticket.notes.includes('Survey date:')) {
      const timeStr = officialTime.toISOString();
      ticket.notes = ticket.notes.replace(/Survey date:\s*[^\s|]+/i, `Survey date: ${timeStr}`);
    }

    // 4. Xóa danh sách đề xuất cũ
    ticket.proposedSurveyTimes = [];
    ticket.rescheduleReason = null;

    await ticket.save();

    // Thông báo cho Khách hàng
    const io = getIo();
    await NotificationService.createNotification(
      {
        userId: ticket.customerId,
        title: "Lịch khảo sát đã được thống nhất",
        message: `Điều phối viên đã chấp nhận giờ khảo sát bạn đề xuất: ${new Date(selectedTime).toLocaleString('vi-VN')}`,
        type: "System",
        ticketId: ticket._id
      },
      io
    );

    return ticket;
  }
  /**
   * Cập nhật trạng thái ticket
   */
  async updateStatus(ticketId, newStatus, userId) {
    const ticket = await RequestTicket.findById(ticketId);
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    return await TicketStateMachine.transition(ticket, newStatus, { userId });
  }

  /**
   * Lấy thông tin ticket
   */
  async getTicket(ticketId) {
    const ticket = await RequestTicket.findById(ticketId)
      .populate('customerId', 'fullName email phone')
      .populate('dispatcherId', 'fullName email phone')
      .populate({
        path: "invoice",
        populate: {
          path: "incident"
        }
      });
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    return ticket;
  }

  /**
   * Lấy list tickets
   */
  async listTickets(filters = {}) {
    const query = {};

    if (filters.customerId) query.customerId = filters.customerId;
    if (filters.dispatcherId) query.dispatcherId = filters.dispatcherId;

    // Support for dispatcher-region-based filtering (Dispatcher Region)
    if (filters.dispatcherRegionFilter) {
      const { dispatcherId, workingAreas, isGeneral } = filters.dispatcherRegionFilter;

      if (isGeneral) {
        // Dispatcher tổng thấy Đơn của họ HOẶC các đơn CREATED chưa gán
        query.$or = [
          { dispatcherId: dispatcherId },
          {
            dispatcherId: null,
            status: 'CREATED'
          }
        ];
      } else {
        const GeocodeService = require('./geocodeService');
        const normalizedAreas = (workingAreas || []).map(area => GeocodeService.normalizeDistrict(area) || area);

        // Dispatcher khu vực thấy Đơn của họ HOẶC các đơn chưa gán trong khu vực
        query.$or = [
          { dispatcherId: dispatcherId },
          {
            dispatcherId: null,
            'pickup.district': { $in: normalizedAreas }
          }
        ];
      }
    }

    if (filters.status) {
      if (filters.status.includes(',')) {
        query.status = { $in: filters.status.split(',').map(s => s.trim()) };
      } else {
        query.status = filters.status;
      }
    }
    if (filters.moveType) query.moveType = filters.moveType;

    const tickets = await RequestTicket.find(query)
      .populate('customerId', 'fullName email phone')
      .populate('dispatcherId', 'fullName email phone')
      .populate({
        path: "invoice",
        populate: {
          path: "incident"
        }
      })
      .sort({ createdAt: -1 })
      .limit(filters.limit || 20)
      .skip(filters.skip || 0);

    return tickets;
  }

  /**
   * Khách hàng chấp nhận báo giá
   * Chuyển status từ QUOTED -> ACCEPTED
   */
  async acceptQuote(ticketId) {
    const ticket = await RequestTicket.findById(ticketId).populate('customerId');
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    await TicketStateMachine.transition(ticket, 'ACCEPTED');

    // Sinh hợp đồng tự động
    const ContractTemplate = require('../models/ContractTemplate');
    const Contract = require('../models/Contract');
    const crypto = require('crypto');

    let template = await ContractTemplate.findOne({ isActive: true });

    if (!template) {
      template = await ContractTemplate.create({
        name: 'Hợp Đồng Dịch Vụ Chuyển Nhà (Mặc Định)',
        content: `<h2>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h2>
                      <h3>Độc lập - Tự do - Hạnh phúc</h3>
                      <h2 style="text-align:center">HỢP ĐỒNG DỊCH VỤ CHUYỂN NHÀ</h2>
                      <p>Khách hàng: \${customerName}</p>
                      <p>Số điện thoại: \${customerPhone}</p>
                      <p>Tổng chi phí: \${totalPrice} VNĐ</p>
                      <p>Hai bên cam kết thực hiện đúng các điều khoản vận chuyển an toàn, đền bù 100% nếu xảy ra đổ vỡ do lỗi vận chuyển.</p>`,
        isActive: true
      });
    }

    let finalContent = template.content;
    const customerName = ticket.customerId ? (ticket.customerId.fullName || '') : 'Khách Hàng';
    const customerPhone = ticket.customerId ? (ticket.customerId.phone || '') : '';
    const totalPrice = ticket.pricing?.totalPrice ? ticket.pricing.totalPrice.toLocaleString() : '0';

    finalContent = finalContent.replace(/\$\{customerName\}/g, customerName)
      .replace(/\$\{customerPhone\}/g, customerPhone)
      .replace(/\$\{totalPrice\}/g, totalPrice);

    const contractNumber = `HĐ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const newContract = new Contract({
      contractNumber,
      templateId: template._id,
      requestTicketId: ticket._id,
      customerId: ticket.customerId ? ticket.customerId._id : null,
      content: finalContent,
      status: 'DRAFT'
    });

    await newContract.save();

    return ticket;
  }

  /**
   * Tương ứng trạng thái ACCEPTED -> CONVERTED
   * Được gọi sau khi Invoice được tạo thành công
   */
  async convertToInvoice(ticketId) {
    const ticket = await RequestTicket.findById(ticketId);
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    await TicketStateMachine.transition(ticket, 'CONVERTED');

    return ticket;
  }

  async findByPaymentOrderCode(orderCode) {
    return await RequestTicket.findOne({ paymentOrderCode: orderCode });
  }
  async createSurveyPayment(ticketId, amount) {

    const ticket = await RequestTicket.findById(ticketId);

    if (!ticket) throw new Error("Ticket not found");
    if (ticket.status !== "CREATED") throw new Error("Invalid ticket status");

    const orderCode = Number(`${Date.now()}${Math.floor(Math.random() * 100)}`);

    ticket.paymentOrderCode = orderCode;
    ticket.paymentType = "SURVEY_DEPOSIT";
    await ticket.save();

    const checkoutUrl = await PaymentService.createPayosPayment({
      orderCode,
      amount,
      ticket,
      paymentType: "SURVEY_DEPOSIT"
    });

    return { checkoutUrl };
  }

  async handlePayosWebhook(payload) {
    const webhookData = PaymentService.verifyWebhook(payload);
    if (!webhookData) return;

    const { orderCode } = webhookData;
    const paymentInfo = await payos.paymentRequests.get(orderCode);
    if (paymentInfo.status !== "PAID") return;

    // 1. CHECK SURVEY PAYMENT
    const ticket = await RequestTicket.findOne({ paymentOrderCode: orderCode });
    if (ticket && ticket.paymentType === "SURVEY_DEPOSIT") {
      if (ticket.isSurveyPaid) return;
      ticket.isSurveyPaid = true;
      await ticket.save();
      return;
    }

    // 2. DELEGATE TO INVOICE SERVICE FOR OTHER PAYMENTS
    await invoiceService.handleInvoicePaymentWebhook(orderCode, paymentInfo);
  }

  /**
   * Manual fallback verification - Delegated to InvoiceService
   */
  async verifyPaymentStatus(ticketId) {
    return await invoiceService.verifyInvoicePayment(ticketId);
  }
}

module.exports = new RequestTicketService();
