  /**
   * RequestTicketController - API handlers for Request Ticket endpoints
   */

  const RequestTicketService = require('../services/requestTicketService');
  const payos = require('../config/payos');
  const AppError = require('../utils/appErrors');

  /**
   * POST /api/request-tickets
   * Customer tạo request ticket mới
   */
  exports.createRequestTicket = async (req, res, next) => {
    try {
      const { moveType, pickup, delivery, notes } = req.body;
      const customerId = req.user?._id || req.user?.id;

      if (!customerId) {
        throw new AppError('User ID không tồn tại', 401);
      }

      if (!moveType || !pickup?.address || !delivery?.address) {
        throw new AppError('Thiếu dữ liệu bắt buộc', 400);
      }

      const ticket = await RequestTicketService.createTicket(
        {
          moveType,
          pickup,
          delivery,
          notes
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

      const tickets = await RequestTicketService.listTickets({
        status,
        customerId,
        dispatcherId,
        limit: parseInt(limit) || 20,
        skip: parseInt(skip) || 0
      });

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
      const userId = req.user?._id || req.user?.id;

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
      const userId = req.user?._id || req.user?.id;

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
      const { proposedTimes, reason } = req.body;
      const userId = req.user?._id || req.user?.id;

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

  /**
   * PUT /api/request-tickets/:id/accept-quote
   * Customer chấp nhận báo giá
   */
  exports.acceptQuote = async (req, res, next) => {
    try {
      const { id } = req.params;
      const userId = req.user?._id || req.user?.id;

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

    const result = await RequestTicketService.createMovingDepositPayment(id);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    next(error);
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