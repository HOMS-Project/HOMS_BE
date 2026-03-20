const Message = require('../models/Message');
const RequestTicket = require('../models/RequestTicket');

const registerVideoSocketEvents = (io, socket) => {
  const userIdLog = socket.user?.id || socket.user?._id || socket.user?.userId;
  console.log(`[VideoChat] User connected: ${socket.id} (User ID: ${userIdLog})`);

  // When a user wants to join a specific room (for chat & video)
  socket.on('join_room', async (roomId) => {
    socket.join(roomId);
    console.log(`[VideoChat] User ${socket.id} joined room ${roomId}`);

    try {
      const ticket = await RequestTicket.findOne({ code: roomId });
      if (ticket) {
        const messages = await Message.find({ 'context.refId': ticket._id, 'context.type': 'RequestTicket' }).sort({ createdAt: 1 }).populate('senderId', 'fullName email');
        
        const history = messages.map(m => ({
          content: m.content,
          senderName: m.senderId?.fullName || m.senderId?.email || 'User',
          timestamp: m.createdAt
        }));
        
        socket.emit('chat_history', history);
      } else {
        socket.emit('chat_history', []);
      }
    } catch (error) {
      console.error('[VideoChat] Error fetching chat history:', error);
      socket.emit('chat_history', []);
    }

    // Notify others in the room
    socket.to(roomId).emit('user_joined', { userId: socket.id, user: socket.user });
  });

  // Handle chat messages
  socket.on('send_message', async (data) => {
    console.log('[VideoChat] Received send_message:', data);
    // data should have { roomId, message, sender, time }
    io.to(data.roomId).emit('receive_message', data);

    try {
      const ticket = await RequestTicket.findOne({ code: data.roomId });
      if (ticket) {
        console.log('[VideoChat] Found ticket:', ticket._id);
        const senderId = socket.user?.id || socket.user?._id || socket.user?.userId;
        console.log('[VideoChat] SenderId:', senderId);
        
        let isCustomer = false;
        if (ticket.customerId && senderId) {
           isCustomer = String(ticket.customerId) === String(senderId);
        }
        
        const recipientId = isCustomer ? (ticket.dispatcherId || ticket.customerId) : ticket.customerId;
        console.log('[VideoChat] RecipientId:', recipientId);
        
        const newMessage = new Message({
          senderId,
          recipientId,
          context: {
            type: 'RequestTicket',
            refId: ticket._id
          },
          content: data.message,
          type: 'Text',
        });
        await newMessage.save();
        console.log('[VideoChat] Message saved successfully:', newMessage._id);
      } else {
        console.log('[VideoChat] Ticket not found for room:', data.roomId);
      }
    } catch (error) {
      console.error('[VideoChat] Error saving message to database:', error);
    }
  });

  // WebRTC Signaling: Offer
  socket.on('offer', (data) => {
    // data: { target, offer, caller, callerName }
    socket.to(data.target).emit('offer', data);
  });

  // WebRTC Signaling: Answer
  socket.on('answer', (data) => {
    // data: { target, answer }
    socket.to(data.target).emit('answer', data);
  });

  // WebRTC Signaling: ICE Candidate
  socket.on('ice_candidate', (data) => {
    // data: { target, candidate }
    socket.to(data.target).emit('ice_candidate', data);
  });

  socket.on('call_ended', (data) => {
    // data: { roomId }
    socket.to(data.roomId).emit('call_ended');
  });

  socket.on('disconnect', () => {
    console.log(`[VideoChat] User disconnected: ${socket.id}`);
    // Optional: emit user disconnected to room, but socket.io doesn't easily tell which room they were in perfectly here.
    socket.broadcast.emit('user_disconnected', { userId: socket.id });
  });
};

module.exports = { registerVideoSocketEvents };
