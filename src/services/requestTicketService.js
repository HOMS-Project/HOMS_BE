/**
 * RequestTicketService - Business logic cho Request Ticket
 */

const RequestTicket = require('../models/RequestTicket');
const AppError = require('../utils/appErrors');
const PaymentService = require('../services/paymentService')
const payos = require("../config/payos");
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
      status: 'CREATED',
      notes: data.notes || ''
    });

    await ticket.save();
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
    if (filters.status) query.status = filters.status;
    if (filters.moveType) query.moveType = filters.moveType;

    const tickets = await RequestTicket.find(query)
      .populate('customerId', 'fullName email phone')
      .populate('dispatcherId', 'fullName email phone')
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
    const ticket = await RequestTicket.findById(ticketId);
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
   async createPaymentLink(ticketId, amount) {

    const ticket = await RequestTicket.findById(ticketId);

    if (!ticket) throw new Error("Ticket not found");
    if (ticket.status !== "CREATED") throw new Error("Invalid ticket status");

    const orderCode = Number(`${Date.now()}${Math.floor(Math.random()*100)}`);

    ticket.paymentOrderCode = orderCode;
    await ticket.save();

    const checkoutUrl = await PaymentService.createPayosPayment({
      orderCode,
      amount,
      ticket
    });

    return { checkoutUrl };
  }
  async handlePayosWebhook (payload) {

  const webhookData = PaymentService.verifyWebhook(payload);
console.log("Verified webhook:", webhookData);
  if (!webhookData) return;

   const { orderCode, code } = webhookData;

    if (code !== "00") return;

 const ticket = await RequestTicket.findOne({
    paymentOrderCode: orderCode
  });


  if (!ticket) return;

  if (ticket.isDepositPaid) {
    console.log("Duplicate webhook ignored");
    return;
  }

 const paymentInfo = await payos.paymentRequests.get(orderCode);
  if (paymentInfo.status !== "PAID") return;

  ticket.status = "WAITING_SURVEY";
  ticket.isDepositPaid = true;

  await ticket.save();
};

}



module.exports = new RequestTicketService();  