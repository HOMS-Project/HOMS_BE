const mongoose = require("mongoose");

const ticketChatSchema = new mongoose.Schema({
  requestTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'RequestTicket', required: true, unique: true },
  messages: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    content: String,
    type: {
      type: String,
      enum: ['Text', 'Image', 'Location', 'Video', 'Call_Log', 'Video_Call_Log'],
      default: 'Text'
    },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model("TicketChat", ticketChatSchema);
