const Notification = require("../models/Notification");

class NotificationService {

  static async createNotification({ userId, title, message, type }, io) {

    const notification = await Notification.create({
      userId,
      title,
      message,
      type
    });

    const socketId = global.onlineUsers.get(userId.toString());

    if (socketId && io) {
      io.to(socketId).emit("new_notification", notification);
    }

    return notification;
  }

  static async getUserNotifications(userId) {
    return await Notification
      .find({ userId })
      .sort({ createdAt: -1 });
  }

  static async markAsRead(notificationId) {
    return await Notification.findByIdAndUpdate(
      notificationId,
      { isRead: true },
      { new: true }
    );
  }

}

module.exports = NotificationService;