const DispatchAssignment = require('../models/DispatchAssignment');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const Route = require('../models/Route');
const AppError = require('../utils/appErrors');

/**
 * GET /api/staff/orders
 * Lấy danh sách các đơn hàng được phân công cho nhân viên hiện tại
 */
exports.getAssignedOrders = async (req, res, next) => {
  try {
    const staffId = req.user.userId || req.user._id || req.user.id;

    // Tìm các DispatchAssignment có chứa staffId trong driverIds hoặc staffIds của bất kỳ assignment nào
    const assignments = await DispatchAssignment.find({
      $or: [
        { 'assignments.driverIds': staffId },
        { 'assignments.staffIds': staffId }
      ]
    }).populate({
      path: 'invoiceId',
      populate: {
        path: 'requestTicketId',
        select: 'code pickup delivery items customerId'
      }
    }).populate('assignments.routeId');

    // Lọc ra các assignment cụ thể mà staffId tham gia và định dạng lại dữ liệu
    const formattedOrders = assignments.map(da => {
      const invoice = da.invoiceId;
      if (!invoice || !invoice.requestTicketId) return null;

      const ticket = invoice.requestTicketId;
      
      // Lấy assignment cụ thể cho staff này
      const personalAssignment = da.assignments.find(a => 
        a.driverIds.some(id => id.toString() === staffId.toString()) || 
        a.staffIds.some(id => id.toString() === staffId.toString())
      );

      return {
        dispatchAssignmentId: da._id,
        assignmentId: personalAssignment ? personalAssignment._id : null,
        invoiceId: invoice._id,
        orderCode: ticket.code,
        status: personalAssignment ? personalAssignment.status : da.status,
        routeId: personalAssignment ? personalAssignment.routeId : null,
        pickup: ticket.pickup,
        delivery: ticket.delivery,
        scheduledTime: invoice.scheduledTime,
        items: ticket.items
      };
    }).filter(order => order !== null);

    res.status(200).json({
      success: true,
      data: formattedOrders
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/staff/orders/:invoiceId
 * Lấy chi tiết đơn hàng bao gồm thông tin khách hàng
 */
exports.getOrderDetails = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    
    const invoice = await Invoice.findById(invoiceId)
      .populate({
        path: 'requestTicketId',
        populate: {
          path: 'customerId',
          select: 'fullName phoneNumber email'
        }
      })
      .populate('routeId');

    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    const ticket = invoice.requestTicketId;
    const customer = ticket.customerId;

    res.status(200).json({
      success: true,
      data: {
        id: invoice._id,
        orderCode: ticket.code,
        status: invoice.status,
        pickup: ticket.pickup,
        delivery: ticket.delivery,
        items: ticket.items,
        scheduledTime: invoice.scheduledTime,
        customer: {
          name: customer.fullName,
          phone: customer.phoneNumber,
          email: customer.email
        },
        route: invoice.routeId
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/staff/assignments/:assignmentId/status
 * Cập nhật trạng thái của phân công cụ thể
 */
exports.updateAssignmentStatus = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { status, notes } = req.body;

    const da = await DispatchAssignment.findOne({ 'assignments._id': assignmentId });
    if (!da) {
      throw new AppError('Assignment not found', 404);
    }

    const assignmentIndex = da.assignments.findIndex(a => a._id.toString() === assignmentId);
    da.assignments[assignmentIndex].status = status;
    
    if (status === 'COMPLETED') {
      da.assignments[assignmentIndex].completedAt = new Date();
    } else if (status === 'IN_PROGRESS' && !da.assignments[assignmentIndex].confirmedAt) {
      da.assignments[assignmentIndex].confirmedAt = new Date();
    }

    await da.save();

    // Nếu tất cả các assignment con đều COMPLETED, cập nhật trạng thái cha
    const allCompleted = da.assignments.every(a => a.status === 'COMPLETED');
    if (allCompleted) {
      da.status = 'COMPLETED';
      await da.save();
      
      // Cập nhật luôn Invoice status
      await Invoice.findByIdAndUpdate(da.invoiceId, { 
        status: 'COMPLETED',
        $push: { 
          timeline: { 
            status: 'COMPLETED', 
            updatedBy: req.user.userId || req.user._id, 
            updatedAt: new Date(),
            notes: 'All staff completed their assignments'
          }
        }
      });
    } else if (status === 'IN_PROGRESS') {
      // Nếu có ít nhất 1 cái IN_PROGRESS, Invoice cũng là IN_PROGRESS
      await Invoice.findByIdAndUpdate(da.invoiceId, { status: 'IN_PROGRESS' });
    }

    res.status(200).json({
      success: true,
      message: `Assignment status updated to ${status}`,
      data: da.assignments[assignmentIndex]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/staff/assignments/:assignmentId/route
 * Driver báo cáo đổi lộ trình (Traffic jam, closed road, etc.)
 */
exports.updateAssignmentRoute = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { routeId, reason, note } = req.body;

    const da = await DispatchAssignment.findOne({ 'assignments._id': assignmentId });
    if (!da) {
      throw new AppError('Assignment not found', 404);
    }

    const assignmentIndex = da.assignments.findIndex(a => a._id.toString() === assignmentId);
    
    // Add deviation record
    da.assignments[assignmentIndex].routeDeviations.push({
      routeId: da.assignments[assignmentIndex].routeId, // Lộ trình cũ
      reason: reason || 'Thay đổi lộ trình',
      note: note,
      reportedAt: new Date()
    });

    // Update to new route
    if (routeId) {
       da.assignments[assignmentIndex].routeId = routeId;
    }

    await da.save();

    res.status(200).json({
      success: true,
      message: 'Assignment route updated successfully',
      data: da.assignments[assignmentIndex]
    });
  } catch (error) {
    next(error);
  }
};
