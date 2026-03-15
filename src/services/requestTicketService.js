/**
 * RequestTicketService - Business logic cho Request Ticket
 */

const RequestTicket = require('../models/RequestTicket');
const Invoice = require("../models/Invoice")
const AppError = require('../utils/appErrors');
const PaymentService = require('../services/paymentService')
const payos = require("../config/payos");
const NotificationService = require("./notificationService");
const { getIo } = require("../utils/socket");
const GeocodeService = require('./geocodeService');

// State transitions
const STATE_TRANSITIONS = {
  CREATED: ['WAITING_SURVEY', 'CANCELLED'],
  WAITING_SURVEY: ['SURVEYED', 'CANCELLED'],
  SURVEYED: ['QUOTED', 'CANCELLED'],
  QUOTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['CONVERTED', 'CANCELLED'],
  CONVERTED: [],
  CANCELLED: []
};

class RequestTicketService {
  /**
   * Tạo request ticket mới
   */
  async createTicket(data, customerId) {
    // Validate dữ liệu
    if (!data.moveType || !['FULL_HOUSE', 'SPECIFIC_ITEMS'].includes(data.moveType)) {
      throw new AppError('moveType không hợp lệ', 400);
    }

    if (!data.pickup?.address || !data.delivery?.address) {
      throw new AppError('Pickup và delivery address không được rỗng', 400);
    }

    if (data.pickup.address === data.delivery.address) {
      throw new AppError('Pickup và delivery phải khác nhau', 400);
    }

    if (data.moveType === 'SPECIFIC_ITEMS' && (!data.items || data.items.length === 0)) {
      throw new AppError('SPECIFIC_ITEMS phải có ít nhất 1 item', 400);
    }

    // Generate code
    const count = await RequestTicket.countDocuments();
    const code = `REQ-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const ticket = new RequestTicket({
      code,
      customerId,
      moveType: data.moveType,
      items: data.items || [],
      pickup: data.pickup,
      delivery: data.delivery,
      scheduledTime: data.scheduledTime || null,
      status: 'CREATED',
      notes: data.notes || ''
    });

    await ticket.save();

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

    // Check có thể cancel không
    const allowedStatuses = ['CREATED', 'WAITING_SURVEY', 'SURVEYED', 'QUOTED', 'ACCEPTED'];
    if (!allowedStatuses.includes(ticket.status)) {
      throw new AppError(`Cannot cancel from status ${ticket.status}`, 400);
    }

    ticket.status = 'CANCELLED';
    ticket.notes = reason || '';

    await ticket.save();
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

    ticket.scheduledTime = selectedTime;
    ticket.status = "WAITING_SURVEY";

    await ticket.save();

    return ticket;
  }
  //  async rejectSurveyTime(ticketId) {

  //   const ticket = await RequestTicket.findById(ticketId);

  //   if (!ticket) {
  //     throw new AppError('Ticket không tồn tại', 404);
  //   }

  //   ticket.status = "CANCEL";

  //   await ticket.save();

  //   return ticket;
  // }
  /**
   * Cập nhật trạng thái ticket
   */
  async updateStatus(ticketId, newStatus, userId) {
    const ticket = await RequestTicket.findById(ticketId);
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    // Validate state transition
    if (!STATE_TRANSITIONS[ticket.status]?.includes(newStatus)) {
      throw new AppError(
        `Cannot transition from ${ticket.status} to ${newStatus}`,
        400
      );
    }

    ticket.status = newStatus;
    await ticket.save();
    return ticket;
  }

  /**
   * Lấy thông tin ticket
   */
  async getTicket(ticketId) {
    const ticket = await RequestTicket.findById(ticketId)
      .populate('customerId', 'fullName email phone')
      .populate('dispatcherId', 'fullName email phone');

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
        // Dispatcher khu vực thấy Đơn của họ HOẶC các đơn chưa gán trong khu vực
        query.$or = [
          { dispatcherId: dispatcherId },
          { 
            dispatcherId: null, 
            'pickup.district': { $in: workingAreas || [] } 
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
      .populate("invoice")
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

    if (ticket.status !== 'QUOTED') {
      throw new AppError(`Không thể chấp nhận báo giá từ trạng thái ${ticket.status}. Trạng thái phải là QUOTED`, 400);
    }

    if (!ticket.pricing?.pricingDataId) {
      throw new AppError('Ticket chưa có báo giá', 400);
    }

    ticket.pricing.acceptedAt = new Date();
    ticket.status = 'ACCEPTED';
    await ticket.save();

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

    if (ticket.status !== 'ACCEPTED') {
      throw new AppError(`Không thể convert từ trạng thái ${ticket.status}. Trạng thái phải là ACCEPTED`, 400);
    }

    ticket.status = 'CONVERTED';
    await ticket.save();

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
  async createMovingDepositPayment(ticketId) {
    console.log("ticketId received:", ticketId);
    console.log("type:", typeof ticketId);
    const invoice = await Invoice.findOne({
      requestTicketId: ticketId
    });

    if (!invoice) {
      throw new Error("Invoice not found for this ticket");
    }

    const depositAmount = Math.floor(invoice.priceSnapshot.totalPrice * 0.5);

    const orderCode = Number(`${Date.now()}${Math.floor(Math.random() * 100)}`);

    invoice.paymentOrderCode = orderCode;

    await invoice.save();

    const checkoutUrl = await PaymentService.createPayosPayment({
      orderCode,
      amount: depositAmount,
      ticket: { code: invoice.code, _id: invoice.requestTicketId },
      paymentType: "MOVING_DEPOSIT"
    });

    return { checkoutUrl };

  }

  async handlePayosWebhook(payload) {

    const webhookData = PaymentService.verifyWebhook(payload);

    if (!webhookData) return;

    const { orderCode } = webhookData;

    const paymentInfo = await payos.paymentRequests.get(orderCode);

    if (paymentInfo.status !== "PAID") return;

    /*
    =====================
    1. CHECK SURVEY PAYMENT
    =====================
    */

    const ticket = await RequestTicket.findOne({
      paymentOrderCode: orderCode
    });

    if (ticket && ticket.paymentType === "SURVEY_DEPOSIT") {

      if (ticket.isSurveyPaid) {
        console.log("Duplicate survey webhook");
        return;
      }

      ticket.isSurveyPaid = true;

      await ticket.save();

      return;
    }

    /*
    =====================
    2. CHECK MOVING DEPOSIT
    =====================
    */

    const invoice = await Invoice.findOne({
      paymentOrderCode: orderCode,
      paymentStatus: "UNPAID"
    });

    if (invoice) {

      if (invoice.paymentStatus !== "UNPAID") {
        console.log("Duplicate deposit webhook");
        return;
      }
      const depositAmount = paymentInfo.amount;
      invoice.paidAmount += depositAmount;
      invoice.remainingAmount =
        invoice.priceSnapshot.totalPrice - invoice.paidAmount;

      invoice.paymentStatus =
        invoice.remainingAmount <= 0 ? "PAID" : "PARTIAL";

      invoice.status = "CONFIRMED"
      await invoice.save();

      return;
    }

  }

  /**
   * Manual fallback verification for the frontend PaymentSuccess
   * Since local env lacks webhooks, frontend explicitly calls this to check the PayOS status.
   */
  async verifyPaymentStatus(ticketId) {
    if (!ticketId || ticketId === "undefined" || ticketId === "null") return;

    const invoice = await Invoice.findOne({ requestTicketId: ticketId, paymentStatus: "UNPAID" });
    if (!invoice || !invoice.paymentOrderCode) {
      return; // Already paid or no invoice found
    }

    try {
      const paymentInfo = await payos.paymentRequests.get(invoice.paymentOrderCode);
      if (paymentInfo.status === "PAID") {
        const depositAmount = paymentInfo.amount;
        invoice.paidAmount += depositAmount;
        invoice.remainingAmount = invoice.priceSnapshot.totalPrice - invoice.paidAmount;

        invoice.paymentStatus = invoice.remainingAmount <= 0 ? "PAID" : "PARTIAL";
        invoice.status = "CONFIRMED";
        await invoice.save();
      }
    } catch (e) {
      console.error("Manual verifyPaymentStatus failed:", e);
    }
  }
};



module.exports = new RequestTicketService();  