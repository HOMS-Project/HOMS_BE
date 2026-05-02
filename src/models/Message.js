const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  context: {
    type: {
      type: String,
      enum: ['Invoice', 'RequestTicket']
    },
    refId: mongoose.Schema.Types.ObjectId
  },

  content: String,

  type: {
    type: String,
    enum: ['Text', 'Media', 'Location', 'Call', 'System'],
    default: 'Text'
  },

  callMetadata: {
    callerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    callType: { type: String, enum: ['Audio', 'Video'] },
    durationSeconds: Number,
    status: { type: String, enum: ['Missed', 'Completed', 'Rejected'] },
    startedAt: Date,
    endedAt: Date,
    recordingUrl: String
  },

  attachments: [
    {
      url: String,
      type: { type: String, enum: ['Image', 'Video', 'File'] }
    }
  ],

  readBy: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      readAt: Date
    }
  ],

  isEdited: { type: Boolean, default: false },
  editedAt: Date,

  isDeleted: { type: Boolean, default: false },
  deletedAt: Date

}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);