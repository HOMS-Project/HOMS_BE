/**
 * InvoiceController - API handlers for Invoice endpoints
 */

const InvoiceService = require('../services/invoiceService');
const AppError = require('../utils/appErrors');

/**
 * GET /api/invoices/:id
 * Lấy chi tiết invoice
 */
exports.getInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    const invoice = await InvoiceService.getInvoice(id);

    res.json({
      success: true,
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/invoices
 * Lấy danh sách invoices
 */
exports.listInvoices = async (req, res, next) => {
  try {
    const { status, customerId, dispatcherId, limit, skip } = req.query;

    const invoices = await InvoiceService.listInvoices({
      status,
      customerId,
      dispatcherId,
      limit: parseInt(limit) || 20,
      skip: parseInt(skip) || 0
    });

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
 * Dispatcher xác nhận invoice
 */
exports.confirmInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const dispatcherId = req.user.userId || req.user._id || req.user.id;

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
 * POST /api/invoices/:id/dispatch
 * Dispatcher phân công vehicles & staff
 */
exports.dispatchVehicles = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { vehicleIds, staffIds, estimatedPickupTime, estimatedDeliveryTime } = req.body;
    const dispatcherId = req.user.userId || req.user._id || req.user.id;

    if (!dispatcherId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    const invoice = await InvoiceService.dispatchVehicles(
      id,
      dispatcherId,
      {
        vehicleIds,
        staffIds,
        estimatedPickupTime,
        estimatedDeliveryTime
      }
    );

    res.json({
      success: true,
      message: 'Vehicles dispatched successfully',
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/invoices/:id/status/:newStatus
 * Cập nhật status invoice
 */
exports.updateInvoiceStatus = async (req, res, next) => {
  try {
    const { id, newStatus } = req.params;
    const { notes } = req.body;
    const userId = req.user.userId || req.user._id || req.user.id;

    if (!userId) {
      throw new AppError('User ID không tồn tại', 401);
    }

    const invoice = await InvoiceService.updateStatus(id, newStatus, userId, notes);

    res.json({
      success: true,
      message: `Invoice status updated to ${newStatus}`,
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
    const userId = req.user.userId || req.user._id || req.user.id;

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
