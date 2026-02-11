const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Context của tin nhắn (Chat về đơn hàng nào?)
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, 
  requestTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'RequestTicket' }, // Chat khi chưa chốt đơn

  content: String,

  // [UPDATE]: Thêm Call Log
  type: {
    type: String,
    enum: ['Text', 'Image', 'Location', 'Video', 'Call_Log', 'Video_Call_Log'], 
    default: 'Text'
  },

  // Chi tiết cuộc gọi (dùng cho type Call_Log)
  callMetadata: {
    durationSeconds: Number,
    status: { type: String, enum: ['Missed', 'Completed', 'Rejected'] },
    startedAt: Date,
    endedAt: Date
  },

  attachments: [String], // Link ảnh/video
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);