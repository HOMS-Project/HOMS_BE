const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },

  content: String,

  type: {
    type: String,
    enum: ['Text', 'Image', 'Location'],
    default: 'Text'
  },

  isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
