/**
 * InvoiceService - Business logic cho Invoice
 */

const Invoice = require('../models/Invoice');
const RequestTicket = require('../models/RequestTicket');
const DispatchAssignment = require('../models/DispatchAssignment');
const AppError = require('../utils/appErrors');

// State transitions
const STATE_TRANSITIONS = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['CANCELLED'],
  CANCELLED: []
};

class InvoiceService {
  /**
   * Tạo Invoice từ RequestTicket ACCEPTED
   * Snapshot giá từ pricing snapshot của RequestTicket
   * Sau khi tạo, cập nhật RequestTicket status -> CONVERTED
   */
  async createInvoiceFromTicket(requestTicketId) {
    // Validate request ticket
    const ticket = await RequestTicket.findById(requestTicketId);
    if (!ticket) {
      throw new AppError('Request ticket không tồn tại', 404);
    }

    if (ticket.status !== 'ACCEPTED') {
      throw new AppError(`Không thể tạo invoice từ trạng thái ${ticket.status}. Trạng thái phải là ACCEPTED`, 400);
    }

    if (!ticket.pricing?.pricingDataId || !ticket.pricing?.subtotal) {
      throw new AppError('RequestTicket chưa có pricing snapshot', 400);
    }

    // Generate invoice code
    const count = await Invoice.countDocuments();
    const code = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // Create invoice - snapshot pricing from RequestTicket
    const invoice = new Invoice({
      code,
      requestTicketId,
      customerId: ticket.customerId,
      pricingDataId: ticket.pricing.pricingDataId,
      priceSnapshot: {
        subtotal: ticket.pricing.subtotal,
        tax: ticket.pricing.tax,
        totalPrice: ticket.pricing.totalPrice,
        breakdown: {} // Nếu cần breakdown chi tiết, load từ PricingData
      },
      paymentStatus: 'UNPAID',
      status: 'DRAFT',
      timeline: [{
        status: 'DRAFT',
        updatedAt: new Date(),
        notes: 'Invoice created from accepted request ticket'
      }]
    });

    await invoice.save();

    // Update RequestTicket status to CONVERTED
    ticket.status = 'CONVERTED';
    await ticket.save();

    return invoice;
  }

  /**
   * Xác nhận invoice (DRAFT → CONFIRMED)
   */
  async confirmInvoice(invoiceId, dispatcherId) {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new AppError('Invoice không tồn tại', 404);
    }

    if (invoice.status !== 'DRAFT') {
      throw new AppError(
        `Cannot confirm invoice from status ${invoice.status}`,
        400
      );
    }

    // Check dispatcher
    if (invoice.dispatcherId?.toString() !== dispatcherId) {
      throw new AppError('Bạn không được assign invoice này', 403);
    }

    invoice.status = 'CONFIRMED';
    invoice.timeline.push({
      status: 'CONFIRMED',
      updatedBy: dispatcherId,
      updatedAt: new Date(),
      notes: 'Invoice confirmed'
    });

    await invoice.save();
    return invoice;
  }

  /**
   * Phân công vehicles + staff (CONFIRMED → ASSIGNED)
   */
  async dispatchVehicles(invoiceId, dispatcherId, dispatchData) {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new AppError('Invoice không tồn tại', 404);
    }

    if (invoice.status !== 'CONFIRMED') {
      throw new AppError(
        `Cannot dispatch from status ${invoice.status}`,
        400
      );
    }

    // Check dispatcher
    if (invoice.dispatcherId?.toString() !== dispatcherId) {
      throw new AppError('Bạn không được assign invoice này', 403);
    }

    // Validate dispatch data
    if (!dispatchData.vehicleIds || dispatchData.vehicleIds.length === 0) {
      throw new AppError('Phải chọn ít nhất 1 xe', 400);
    }

    if (dispatchData.estimatedPickupTime && dispatchData.estimatedDeliveryTime) {
      const pickupTime = new Date(dispatchData.estimatedPickupTime);
      const deliveryTime = new Date(dispatchData.estimatedDeliveryTime);
      if (deliveryTime <= pickupTime) {
        throw new AppError('estimatedDeliveryTime phải > estimatedPickupTime', 400);
      }
    }

    // Create dispatch assignment
    const assignment = new DispatchAssignment({
      invoiceId,
      assignments: dispatchData.vehicleIds?.map(vehicleId => ({
        vehicleId,
        pickupTime: dispatchData.estimatedPickupTime,
        deliveryTime: dispatchData.estimatedDeliveryTime
      })) || [],
      createdBy: dispatcherId
    });

    await assignment.save();

    // Update invoice
    invoice.dispatchAssignmentId = assignment._id;
    invoice.status = 'ASSIGNED';
    invoice.timeline.push({
      status: 'ASSIGNED',
      updatedBy: dispatcherId,
      updatedAt: new Date(),
      notes: `Assigned ${dispatchData.vehicleIds.length} vehicle(s)`
    });

    await invoice.save();
    return invoice;
  }

  /**
   * Cập nhật status invoice
   */
  async updateStatus(invoiceId, newStatus, updatedBy, notes = '') {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new AppError('Invoice không tồn tại', 404);
    }

    // Check transition hợp lệ
    const allowedTransitions = STATE_TRANSITIONS[invoice.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new AppError(
        `Cannot transition from ${invoice.status} to ${newStatus}`,
        400
      );
    }

    invoice.status = newStatus;
    invoice.timeline.push({
      status: newStatus,
      updatedBy,
      updatedAt: new Date(),
      notes: notes || `Status updated to ${newStatus}`
    });

    await invoice.save();
    return invoice;
  }

  /**
   * Lấy thông tin invoice
   */
  async getInvoice(invoiceId) {
    const invoice = await Invoice.findById(invoiceId)
      .populate('customerId', 'fullName email phone')
      .populate('requestTicketId')
      .populate('dispatchAssignmentId');

    if (!invoice) {
      throw new AppError('Invoice không tồn tại', 404);
    }

    return invoice;
  }

  /**
   * Lấy list invoices
   */
  async listInvoices(filters = {}) {
    const query = {};

    if (filters.customerId) query.customerId = filters.customerId;
    if (filters.dispatcherId) query.dispatcherId = filters.dispatcherId;
    if (filters.status) query.status = filters.status;

    const invoices = await Invoice.find(query)
      .populate('customerId', 'fullName email phone')
      .sort({ createdAt: -1 })
      .limit(filters.limit || 20)
      .skip(filters.skip || 0);

    return invoices;
  }

  /**
   * Lấy timeline của invoice
   */
  async getTimeline(invoiceId) {
    const invoice = await Invoice.findById(invoiceId, 'timeline');
    if (!invoice) {
      throw new AppError('Invoice không tồn tại', 404);
    }

    return invoice.timeline || [];
  }

  /**
   * Hủy invoice
   */
  async cancelInvoice(invoiceId, cancelledBy, reason) {
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new AppError('Invoice không tồn tại', 404);
    }

    const allowedStatuses = ['DRAFT', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED'];
    if (!allowedStatuses.includes(invoice.status)) {
      throw new AppError(`Cannot cancel from status ${invoice.status}`, 400);
    }

    invoice.status = 'CANCELLED';
    invoice.timeline.push({
      status: 'CANCELLED',
      updatedBy: cancelledBy,
      updatedAt: new Date(),
      notes: reason || 'Invoice cancelled'
    });

    await invoice.save();
    return invoice;
  }
}

module.exports = new InvoiceService();
