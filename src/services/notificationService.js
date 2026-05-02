const Notification = require("../models/Notification");

class NotificationService {

  static async createNotification({ userId, title, message, type, ticketId }, io) {

    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      ticketId
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
static async notifyCustomer(userId, eventName, payload, io) {
  if (io) {
    io.to(userId.toString()).emit(eventName, payload);
  }
}
  static async createDebouncedMessageNotification({ userId, ticketId, senderName, messageContent }) {
    // 5-minute debounce window
    const debounceMs = 5 * 60 * 1000;
    const sinceDate = new Date(Date.now() - debounceMs);

    // Check if we already sent a NEW_MESSAGE notification for this ticket recently
    const recentNotification = await Notification.findOne({
      userId,
      ticketId,
      type: 'System', // Using 'System' as generic for now, could be 'New_Message'
      title: new RegExp(`Tin nhắn mới từ ${senderName}`),
      createdAt: { $gte: sinceDate }
    });

    if (recentNotification) {
      // Skip pushing a new one to prevent spam
      return null;
    }

    // Snippet for safe body text
    const displayMsg = messageContent && messageContent.length > 50 
        ? messageContent.substring(0, 47) + '...' 
        : messageContent;

    return await this.createNotification(
       userId,
       ticketId,
       `Tin nhắn mới từ ${senderName}`,
       displayMsg || 'Bạn có tin nhắn mới hình ảnh/video',
       'System'
    );
  }
}

module.exports = NotificationService;