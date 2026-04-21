const NotificationService = require("../services/notificationService");

exports.getNotifications = async (req, res) => {
  try {

    const userId = req.user.userId || req.user._id || req.user.id;

    const raw = await NotificationService.getUserNotifications(userId);

    // Format each notification to ensure ticketId is a plain string for the mobile client.
    // Mobile uses 'ticketId' to navigate to OrderDetails (which supports both Invoice ID and RequestTicket ID).
    const data = raw.map((n) => {
      const obj = n.toObject ? n.toObject() : { ...n };
      return {
        ...obj,
        id: String(obj._id || obj.id || ''),
        ticketId: obj.ticketId ? String(obj.ticketId) : null,
      };
    });

    res.json({
      success: true,
      data
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {

    const id = req.params.id;

    await NotificationService.markAsRead(id);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};