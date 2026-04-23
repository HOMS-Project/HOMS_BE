/**
 * Controller xử lý Invoice
 * Tích hợp các services: Survey, Pricing, RouteValidation, VehicleDispatch
 */

const Invoice = require('../models/Invoice');
const InvoiceService = require('../services/invoiceService');
const SurveyService = require('../services/surveyService');
const PricingService = require('../services/pricingService');
const RouteValidationService = require('../services/routeValidationService');
const DispatchService = require('../services/dispatchService');
const AppError = require('../utils/appErrors');

/**
 * POST /api/invoices/from-ticket/:requestTicketId
 * Tạo Invoice từ RequestTicket ACCEPTED
 * Snapshot giá từ RequestTicket.pricing
 */
exports.createInvoiceFromTicket = async (req, res, next) => {
  try {
    const { requestTicketId } = req.params;

    const invoice = await InvoiceService.createInvoiceFromTicket(requestTicketId);

    res.status(201).json({
      success: true,
      message: 'Invoice created from accepted request ticket',
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices/ticket/:ticketId
 * Returns the invoice for a given request ticket (used by SignContract to check payment status)
 */
exports.getInvoiceByTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const invoice = await Invoice.findOne({ requestTicketId: ticketId });
    if (!invoice) {
      return res.status(200).json({ success: true, data: null });
    }
    res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    next(error);
  }
};

/**
 * 1. TẠO INVOICE TỪ REQUEST TICKET
 * Status: DRAFT
 */
exports.createInvoice = async (req, res) => {
  try {
    const { requestTicketId, customerId, pickup, delivery, moveType } = req.body;

    const invoice = new Invoice({
      requestTicketId,
      customerId,
      pickup,
      delivery,
      moveType,
      status: 'DRAFT'
    });

    await invoice.save();

    res.status(201).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 2. KHẢO SÁT
 * Tạo survey & cập nhật weight/volume thực tế
 */
exports.scheduleSurvey = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { surveyType, scheduledDate } = req.body;

    const survey = await SurveyService.createSurvey(invoiceId, {
      surveyType,
      scheduledDate,
      surveyorId: req.user.userId || req.user._id || req.user.id
    });

    // Cập nhật invoice status
    await Invoice.findByIdAndUpdate(invoiceId, {
      status: 'WAITING_SURVEY'
    });

    res.status(201).json({
      success: true,
      data: survey
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 3. HOÀN TẤT KHẢO SÁT
 * Tính toán weight/volume thực tế
 */
exports.completeSurvey = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { surveyItems, accessibility, notes } = req.body;

    const survey = await SurveyService.completeSurvey(invoiceId, {
      items: surveyItems,
      accessibility,
      notes
    });

    // Cập nhật invoice status
    await Invoice.findByIdAndUpdate(invoiceId, {
      status: 'SURVEYED'
    });

    res.status(200).json({
      success: true,
      data: survey
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 4. TÍNH GIÁ
 * Tính basePrice + services + staff + vehicle + surcharge + tax
 */
exports.calculatePrice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const {
      estimatedDistance,
      totalWeight,
      totalVolume,
      services,
      staffCount,
      vehicleType,
      estimatedDuration,
      surcharge,
      promotionId,
      discountCode
    } = req.body;

    const pricing = await PricingService.calculatePrice(invoiceId, {
      estimatedDistance,
      totalWeight,
      totalVolume,
      services,
      staffCount,
      vehicleType,
      estimatedDuration,
      surcharge,
      promotionId,
      discountCode,
      calculatedBy: req.user.userId || req.user._id || req.user.id
    });

    // Cập nhật invoice status
    await Invoice.findByIdAndUpdate(invoiceId, {
      status: 'PRICE_QUOTED'
    });

    res.status(200).json({
      success: true,
      data: pricing
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 5. KIỂM TRA TUYẾN ĐƯỜNG
 */
exports.validateRoute = async (req, res) => {
  try {
    const { routeId } = req.params;
    const {
      vehicleType,
      totalWeight,
      totalVolume,
      pickupTime,
      deliveryTime,
      pickupAddress,
      deliveryAddress
    } = req.body;

    const validation = await RouteValidationService.validateRoute(routeId, {
      vehicleType,
      totalWeight,
      totalVolume,
      pickupTime: new Date(pickupTime),
      deliveryTime: new Date(deliveryTime),
      pickupAddress,
      deliveryAddress
    });

    res.status(200).json({
      success: true,
      data: validation
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 6. TÌM TUYẾN ĐƯỜNG TỐI ƯU
 */
exports.findOptimalRoute = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await Invoice.findById(invoiceId);

    const routes = await RouteValidationService.findOptimalRoute({
      vehicleType: req.body.vehicleType,
      totalWeight: req.body.totalWeight,
      totalVolume: req.body.totalVolume,
      pickupTime: new Date(invoice.scheduledTime)
    });

    res.status(200).json({
      success: true,
      data: routes
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 9. LẤY THÔNG TIN INVOICE
 */
exports.getInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await InvoiceService.getInvoice(invoiceId);

    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    // Authorization: customers may only access their own invoices
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const role = (req.user?.role || '').toString().toLowerCase();

    if (role === 'customer') {
      // invoice.customerId may be populated or just an ObjectId
      const custId = invoice.customerId && invoice.customerId._id ? invoice.customerId._id.toString() : (invoice.customerId ? invoice.customerId.toString() : null);
      if (!custId || custId !== String(userId)) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập hóa đơn này.' });
      }
    } else if (!['admin', 'staff', 'dispatcher'].includes(role)) {
      // other roles (if any) are not allowed
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập hóa đơn này.' });
    }

    res.status(200).json({ success: true, data: invoice });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 10. CẬP NHẬT TRẠNG THÁI INVOICE
 */
exports.updateInvoiceStatus = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { status, notes } = req.body;

    const invoice = await Invoice.findByIdAndUpdate(
      invoiceId,
      { status, notes },
      { new: true }
    );

    // Thêm vào timeline
    invoice.timeline.push({
      status,
      updatedBy: req.user.userId || req.user._id || req.user.id,
      updatedAt: new Date(),
      notes
    });

    await invoice.save();

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
/**
 * GET /api/invoices
 * Lấy danh sách invoices
 */
exports.listInvoices = async (req, res, next) => {
  try {
    const { status, customerId, dispatcherId, limit, skip } = req.query;

    const filters = {
      status,
      customerId,
      dispatcherId,
      limit: parseInt(limit) || 20,
      skip: parseInt(skip) || 0
    };

    if (req.user.role === 'customer') {
      filters.customerId = req.user.userId || req.user._id || req.user.id;
    }

    if (req.user.role === 'dispatcher') {
      filters.dispatcherRegionFilter = {
        dispatcherId: req.user.userId || req.user._id || req.user.id,
        workingAreas: req.user.workingAreas || [],
        isGeneral: req.user.isGeneral || false
      };
    }

    const invoices = await InvoiceService.listInvoices(filters);

    res.json({
      success: true,
      data: invoices
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/invoices/:id/confirm
 * Xác nhận invoice (DRAFT → CONFIRMED)
 */
exports.confirmInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dispatcherId = req.user?.userId || req.user?._id || req.user?.id;

    if (!dispatcherId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    const invoice = await InvoiceService.confirmInvoice(id, dispatcherId);

    res.json({
      success: true,
      message: 'Invoice confirmed successfully',
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices/:id/timeline
 * Lấy timeline của invoice
 */
exports.getTimeline = async (req, res, next) => {
  try {
    const { id } = req.params;

    const timeline = await InvoiceService.getTimeline(id);

    res.json({
      success: true,
      data: timeline
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/invoices/:id/cancel
 * Hủy invoice
 */
exports.cancelInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    const invoice = await InvoiceService.cancelInvoice(id, userId, reason);

    res.json({
      success: true,
      message: 'Invoice cancelled',
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/invoices/:invoiceId/confirm-reschedule
 * Scenario B — Customer accepts or rejects a dispatcher-proposed dispatch time change.
 *
 * Body: { action: 'ACCEPT' | 'REJECT' }
 *
 * ACCEPT: moves proposedDispatchTime → scheduledTime, clears proposal fields,
 *         notifies customer of confirmation.
 * REJECT: clears proposal, notifies the dispatcher to revisit the plan.
 */
exports.confirmReschedule = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const { action } = req.body; // 'ACCEPT' | 'REJECT'
    const userId = req.user?.userId || req.user?._id || req.user?.id;

    if (!['ACCEPT', 'REJECT'].includes(action)) {
      throw new AppError("action phải là 'ACCEPT' hoặc 'REJECT'", 400);
    }

    const Invoice = require('../models/Invoice');
    const NotificationService = require('../services/notificationService');
    const T = require('../utils/notificationTemplates');
    const dayjs = require('dayjs');

    const invoice = await Invoice.findById(invoiceId)
      .populate('requestTicketId', 'code customerId dispatcherId')
      .populate('customerId', '_id');

    if (!invoice) throw new AppError('Invoice không tồn tại', 404);

    // Auth: only the owning customer may call this endpoint
    const role = (req.user?.role || '').toLowerCase();
    const custId = invoice.customerId?._id?.toString() || invoice.customerId?.toString();
    if (role === 'customer' && custId !== String(userId)) {
      throw new AppError('Bạn không có quyền xác nhận lịch của hóa đơn này.', 403);
    }

    if (invoice.rescheduleStatus !== 'PENDING_APPROVAL' || !invoice.proposedDispatchTime) {
      throw new AppError('Không có đề xuất đổi lịch nào đang chờ xác nhận.', 400);
    }

    const ticket = invoice.requestTicketId;
    let ioInstance = null;
    try { const { getIo } = require('../utils/socket'); ioInstance = getIo(); } catch (_) { /* no-op */ }

    if (action === 'ACCEPT') {
      const confirmedTime = dayjs(invoice.proposedDispatchTime).format('HH:mm DD/MM/YYYY');
      invoice.scheduledTime = invoice.proposedDispatchTime;
      invoice.proposedDispatchTime = null;
      invoice.rescheduleStatus = 'ACCEPTED';
      await invoice.save();

      // Notify customer: schedule confirmed
      await NotificationService.createNotification({
        userId: ticket.customerId,
        ...T.DISPATCH_RESCHEDULE_ACCEPTED({ ticketCode: invoice.code, confirmedTime }),
        ticketId: ticket._id
      }, ioInstance);

      // Notify dispatcher: customer accepted the proposed time
      if (ticket.dispatcherId) {
        await NotificationService.createNotification({
          userId: ticket.dispatcherId,
          ...T.DISPATCH_RESCHEDULE_ACCEPTED_BY_CUSTOMER({ ticketCode: invoice.code, confirmedTime }),
          ticketId: ticket._id
        }, ioInstance);
      }

      return res.json({ success: true, message: 'Đã xác nhận lịch vận chuyển mới.', data: invoice });
    }

    // REJECT — revert invoice back to CONFIRMED so dispatcher can reassign
    invoice.proposedDispatchTime = null;
    invoice.rescheduleStatus = 'REJECTED';
    invoice.status = 'CONFIRMED';          // ← revert so it reappears in the dispatcher queue
    invoice.dispatchAssignmentId = null;   // ← clear the previous (now-invalid) assignment
    await invoice.save();

    // Notify dispatcher (if assigned) that customer rejected
    if (ticket.dispatcherId) {
      await NotificationService.createNotification({
        userId: ticket.dispatcherId,
        ...T.DISPATCH_RESCHEDULE_REJECTED({ ticketCode: invoice.code }),
        ticketId: ticket._id
      }, ioInstance);
    }

    return res.json({ success: true, message: 'Đã từ chối đề xuất đổi lịch.', data: invoice });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/invoices/:id/confirm-understaffed
 */
exports.confirmUnderstaffed = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const customerId = req.user?.userId || req.user?._id || req.user?.id;

    const invoice = await InvoiceService.confirmUnderstaffed(id, action, customerId);

    // If rejected, we might want to revert status or notify dispatcher
    // For now, just recording the action is enough as the dispatcher will see it in the dashboard
    
    res.json({
      success: true,
      message: 'Action recorded successfully',
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};