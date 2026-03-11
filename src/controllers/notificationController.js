const NotificationService = require("../services/notificationService");

exports.getNotifications = async (req, res) => {
  try {

    const userId = req.user.id;

    const data = await NotificationService.getUserNotifications(userId);

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