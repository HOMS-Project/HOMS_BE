/**
 * RequestTicketController - API handlers for Request Ticket endpoints
 */

const RequestTicketService = require('../services/requestTicketService');
const InvoiceService = require('../services/invoiceService');
const payos = require('../config/payos');
const AppError = require('../utils/appErrors');

/**
 * POST /api/request-tickets
 * Customer tạo request ticket mới
 */
exports.createRequestTicket = async (req, res, next) => {
  try {
    const { moveType, rentalDetails, pickup, delivery, notes, scheduledTime, items, distanceKm } = req.body;
    const customerId = req.user.userId || req.user._id || req.user.id;

    if (!customerId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    if (!moveType || !pickup?.address || !delivery?.address) {
      throw new AppError('Thiếu dữ liệu bắt buộc', 400);
    }

    const ticket = await RequestTicketService.createTicket(
      {
        moveType,
        rentalDetails,
        pickup,
        delivery,
        notes,
        scheduledTime: scheduledTime ? new Date(scheduledTime) : undefined,
        items,
        distanceKm
      },
      customerId
    );

    res.status(201).json({
      success: true,
      message: 'Request ticket created successfully',
      data: ticket
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/request-tickets/:id/approve
 * Head Dispatcher approves a CREATED ticket.
 * - FULL_HOUSE: body must include { surveyorId }
 * - SPECIFIC_ITEMS / TRUCK_RENTAL: triggers auto-assignment, no surveyorId needed
 */
exports.approveTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { surveyorId } = req.body;
    const approverId = req.user.userId || req.user._id || req.user.id;

    if (!approverId) throw new AppError('User ID không tồn tại', 401);

    const ticket = await RequestTicketService.approveTicket(id, approverId, surveyorId);

    res.status(200).json({
      success: true,
      message: 'Đơn hàng đã được duyệt thành công',
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/request-tickets/:id
 * Lấy chi tiết request ticket
 */
exports.getRequestTicket = async (req, res, next) => {
  try {
    const { id } = req.params;

    const ticket = await RequestTicketService.getTicket(id);

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/request-tickets
 * Lấy danh sách request tickets
 */
exports.listRequestTickets = async (req, res, next) => {
  try {
    const { status, customerId, dispatcherId, limit, skip } = req.query;

    const filters = {
      status,
      customerId,
      dispatcherId,
      limit: parseInt(limit) || 20,
      skip: parseInt(skip) || 0
    };

    // Logic: Dispatcher only sees tickets they are assigned to OR unassigned tickets in their working areas
    if (req.user.role === 'dispatcher') {
      filters.dispatcherRegionFilter = {
        dispatcherId: req.user.userId || req.user._id || req.user.id,
        workingAreas: req.user.workingAreas || [],
        isGeneral: req.user.isGeneral || false
      };
    } else if (req.user.role === 'customer') {
      filters.customerId = req.user.userId || req.user._id || req.user.id;
    }

    const tickets = await RequestTicketService.listTickets(filters);

    res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/request-tickets/:id/status
 * Cập nhật trạng thái request ticket
 */
exports.updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId || req.user._id || req.user.id;

    if (!userId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    const ticket = await RequestTicketService.updateStatus(id, status, userId);

    res.json({
      success: true,
      message: 'Request ticket status updated successfully',
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/request-tickets/:id/cancel
 * Hủy request ticket
 */
exports.cancelRequestTicket = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.userId || req.user._id || req.user.id;

    if (!userId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    const ticket = await RequestTicketService.cancelTicket(id, userId, reason);

    res.json({
      success: true,
      message: 'Request ticket cancelled',
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/request-tickets/:id/propose-time
 * Dispatcher từ chối lịch khảo sát và đề xuất lịch mới
 */
exports.proposeSurveyTime = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { proposedTimes, reason, surveyorId: bodySurveyorId } = req.body;
    const userId = bodySurveyorId || req.user.userId || req.user._id || req.user.id;

    if (!userId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    if (!proposedTimes || !Array.isArray(proposedTimes) || proposedTimes.length === 0) {
      throw new AppError('Phải cung cấp ít nhất một giờ đề xuất mới', 400);
    }

    const ticket = await RequestTicketService.proposeNewTime(id, userId, proposedTimes, reason);

    res.json({
      success: true,
      message: 'Đã cập nhật giờ đề xuất mới cho quá trình khảo sát',
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};
exports.acceptSurveyTime = async (req, res, next) => {
  try {

    const { selectedTime } = req.body;
    const ticketId = req.params.id;

    await RequestTicketService.acceptSurveyTime(ticketId, selectedTime);

    res.json({
      success: true,
      message: "Đã chấp nhận thời gian khảo sát"
    });

  } catch (error) {
    next(error);
  }
};

exports.rejectSurveyTime = async (req, res, next) => {
  try {
    const ticketId = req.params.id;
    const { proposedTime, reason } = req.body;
    const userId = req.user.userId || req.user._id || req.user.id;

    const ticket = await RequestTicketService.rejectSurveyTime(ticketId, userId, reason, proposedTime);
    res.json({
      success: true,
      message: "Đã yêu cầu đổi lịch khảo sát thành công",
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/request-tickets/:id/dispatcher-accept-time
 */
exports.dispatcherAcceptSurveyTime = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { selectedTime } = req.body;

    if (!selectedTime) {
      throw new AppError('Vui lòng chọn thời gian!', 400);
    }
    const result = await RequestTicketService.dispatcherAcceptTime(id, selectedTime);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
/**
 * PUT /api/request-tickets/:id/accept-quote
 * Customer chấp nhận báo giá
 */
exports.acceptQuote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user._id || req.user.id;

    if (!userId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    const ticket = await RequestTicketService.acceptQuote(id, userId);

    res.json({
      success: true,
      message: 'Quote accepted successfully',
      data: ticket
    });
  } catch (error) {
    next(error);
  }
};



exports.createSurveyPayment = async (req, res, next) => {
  try {

    const { id } = req.params;
    const { amount } = req.body;

    const result = await RequestTicketService.createSurveyPayment(id, amount);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    next(error);
  }
};


exports.createMovingDepositPayment = async (req, res, next) => {
  try {

    const { id } = req.params;

    const result = await InvoiceService.createMovingDepositPayment(id);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    next(error);
  }
};
exports.createMovingRemainingPayment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await InvoiceService.createMovingRemainingPayment(id);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};
exports.verifyPaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    await InvoiceService.verifyInvoicePayment(id);

    res.json({
      success: true,
      message: "Payment status optionally synced"
    });
  } catch (error) {
    console.error("Verification endpoint error:", error);
    // don't fail, just return success so the frontend redirects peacefully
    res.json({
      success: true,
      message: "Verification executed"
    });
  }
};
exports.payosWebhook = async (req, res) => {
  try {
    const payload = JSON.parse(req.body.toString());
    console.log("Webhook body:", payload);
    await RequestTicketService.handlePayosWebhook(payload);

    res.json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(200).json({
      success: false
    });
  }
};