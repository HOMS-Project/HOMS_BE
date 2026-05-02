const Message = require('../models/Message');
const RequestTicket = require('../models/RequestTicket');
const AppError = require('../utils/appErrors');

exports.getMessagesForTicket = async (req, res, next) => {
  try {
    const { ticketCode } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const ticket = await RequestTicket.findOne({ code: ticketCode });
    if (!ticket) {
      throw new AppError('Ticket không tồn tại', 404);
    }

    const userId = req.user.userId || req.user._id || req.user.id;
    const role = req.user.role;
    const isCustomer = String(ticket.customerId) === String(userId);
    const isDispatcher = String(ticket.dispatcherId) === String(userId);
    const isAdminOrGeneral = ['admin', 'staff'].includes(role) || (role === 'dispatcher' && req.user.isGeneral);

    if (!isCustomer && !isDispatcher && !isAdminOrGeneral) {
      throw new AppError('Không có quyền xem tin nhắn của đơn hàng này', 403);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const messages = await Message.find({ 'context.refId': ticket._id, 'context.type': 'RequestTicket' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('senderId', 'fullName email avatar');

    // Need to reverse them to display oldest first in UI, since we sorted -createdAt for pagination
    const formattedHistory = messages.map(m => ({
      _id: m._id,
      roomId: ticket.code,
      content: m.content,
      type: m.type,
      attachments: m.attachments,
      senderName: m.senderId?.fullName || m.senderId?.email || (m.type === 'System' ? 'Hệ thống HOMS' : 'User'),
      senderAvatar: m.senderId?.avatar,
      senderId: m.senderId?._id || null,
      timestamp: m.createdAt,
      readBy: m.readBy
    })).reverse();

    const total = await Message.countDocuments({ 'context.refId': ticket._id, 'context.type': 'RequestTicket' });

    res.json({
      success: true,
      data: formattedHistory,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};
