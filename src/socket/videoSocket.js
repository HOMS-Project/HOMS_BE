const TicketChat = require('../models/TicketChat');
const RequestTicket = require('../models/RequestTicket');

const registerVideoSocketEvents = (io, socket) => {
  console.log(`[VideoChat] User connected: ${socket.id} (User ID: ${socket.user?.id})`);

  // When a user wants to join a specific room (for chat & video)
  socket.on('join_room', async (roomId) => {
    socket.join(roomId);
    console.log(`[VideoChat] User ${socket.id} joined room ${roomId}`);

    try {
      const ticket = await RequestTicket.findOne({ code: roomId });
      if (ticket) {
        const chat = await TicketChat.findOne({ requestTicketId: ticket._id });
        if (chat) {
          socket.emit('chat_history', chat.messages);
        } else {
          socket.emit('chat_history', []);
        }
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
    // data should have { roomId, message, sender, time }
    io.to(data.roomId).emit('receive_message', data);

    try {
      const ticket = await RequestTicket.findOne({ code: data.roomId });
      if (ticket) {
        let chat = await TicketChat.findOne({ requestTicketId: ticket._id });
        const newMessage = {
          senderId: socket.user?.id || socket.user?._id,
          senderName: data.sender || socket.user?.fullName || 'User',
          content: data.message,
          type: 'Text',
        };

        if (chat) {
          chat.messages.push(newMessage);
          await chat.save();
        } else {
          chat = new TicketChat({
            requestTicketId: ticket._id,
            messages: [newMessage]
          });
          await chat.save();
        }
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
