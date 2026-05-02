const Message = require('../models/Message');
const RequestTicket = require('../models/RequestTicket');
const NotificationService = require('../services/notificationService');
const User = require('../models/User');

const registerVideoSocketEvents = (io, socket) => {
  const userIdLog = socket.user?.id || socket.user?._id || socket.user?.userId;
  console.log(`[VideoChat] User connected: ${socket.id} (User ID: ${userIdLog})`);

  // When a user wants to join a specific room (for chat & video)
  socket.on('join_room', async (roomId) => {
    try {
      const ticket = await RequestTicket.findOne({ code: roomId });
      if (!ticket) {
        return socket.emit('chat_error', { message: 'Ticket not found' });
      }

      const role = socket.user?.role;
      const isCustomer = String(ticket.customerId) === String(userIdLog);
      const isDispatcher = String(ticket.dispatcherId) === String(userIdLog);
      const isAdminOrGeneral = ['admin', 'staff'].includes(role) || (role === 'dispatcher' && socket.user?.isGeneral);

      if (!isCustomer && !isDispatcher && !isAdminOrGeneral) {
        console.warn(`[VideoChat] Unauthorized join attempt by ${userIdLog} for room ${roomId}`);
        return socket.emit('chat_error', { message: 'Unauthorized to join this room' });
      }

      socket.join(roomId);
      console.log(`[VideoChat] User ${socket.id} joined room ${roomId}`);

      // We no longer emit full `chat_history`. The client will use REST API for pagination.
      // But for backward compatibility or simple initial load if they haven't switched yet, 
      // we can emit a small set or just let REST handle it. We will emit empty to force REST.
      socket.emit('chat_history', []);
      
      // Notify others in the room
      socket.to(roomId).emit('user_joined', { userId: socket.id, user: socket.user });
    } catch (error) {
      console.error('[VideoChat] Error in join_room:', error);
      socket.emit('chat_error', { message: 'Failed to join room' });
    }
  });

  // Typing indicators
  socket.on('typing', (data) => {
    socket.to(data.roomId).emit('user_typing', { userId: userIdLog, isTyping: true });
  });

  socket.on('stop_typing', (data) => {
    socket.to(data.roomId).emit('user_typing', { userId: userIdLog, isTyping: false });
  });

  // Read receipts and cross-tab sync
  socket.on('message_read', async (data) => {
    const { messageIds, roomId } = data;
    if (!messageIds || !messageIds.length) return;

    try {
      await Message.updateMany(
        { _id: { $in: messageIds }, 'readBy.userId': { $ne: userIdLog } },
        { $push: { readBy: { userId: userIdLog, readAt: new Date() } } }
      );

      // Broadcast to room so sender knows it was read
      io.to(roomId).emit('message_read_receipt', { messageIds, readBy: userIdLog, readAt: new Date() });

      // Sync across all of this user's connected tabs/sockets globally (requires room or global finding)
      // If we use socket.rooms, we'd emit to a personal user room if we had one.
      // Assuming a personal room exists like `user_${userIdLog}` (we'll emit it there just in case)
      io.to(`user_${userIdLog}`).emit('unread_count_sync', { roomId, readMessageIds: messageIds });
    } catch (err) {
      console.error('[VideoChat] Error updating read receipt:', err);
    }
  });

  // Handle chat messages
  socket.on('send_message', async (data) => {
    console.log('[VideoChat] Received send_message:', data);
    
    try {
      const ticket = await RequestTicket.findOne({ code: data.roomId });
      if (ticket) {
        console.log('[VideoChat] Found ticket:', ticket._id);
        
        let isCustomer = false;
        if (ticket.customerId && userIdLog) {
           isCustomer = String(ticket.customerId) === String(userIdLog);
        }
        
        const recipientId = isCustomer ? ticket.dispatcherId : ticket.customerId;
        
        // Emitting optimistic receive immediately is fine, but we'll enrich it with message ID below
        const newMessage = new Message({
          senderId: userIdLog || null,
          recipientId,
          context: {
            type: 'RequestTicket',
            refId: ticket._id
          },
          content: data.message || '',
          type: data.type || 'Text',
          attachments: data.attachments || []
        });
        await newMessage.save();
        console.log('[VideoChat] Message saved successfully:', newMessage._id);

        // Emit back enriched message
        io.to(data.roomId).emit('receive_message', { 
            _id: newMessage._id,
            roomId: data.roomId,
            message: data.message,
            type: data.type || 'Text',
            attachments: data.attachments || [],
            senderName: data.sender || 'User',
            senderId: userIdLog,
            time: data.time || new Date().toISOString()
        });

        // Offline Fallback Notifications
        if (recipientId) {
          // Check if recipient is connected globally
          const recipientOnline = global.onlineUsers && global.onlineUsers.get(recipientId.toString());
          // Alternatively, we could check if they are in the Socket.io room specifically
          // const roomSockets = await io.in(data.roomId).fetchSockets();
          // const isRecipientInRoom = roomSockets.some(s => s.user?.id == recipientId);
          
          if (!recipientOnline) {
            // Debounce logic inside NotificationService
            await NotificationService.createDebouncedMessageNotification({
               userId: recipientId,
               ticketId: ticket._id,
               senderName: data.sender || 'Người dùng',
               messageContent: data.message
            });
          }
        }
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

  socket.on('disconnecting', () => {
    // Notify only the rooms this socket is currently in
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        socket.to(room).emit('user_disconnected', { userId: socket.id });
      }
    });
  });

  socket.on('disconnect', () => {
    console.log(`[VideoChat] User disconnected: ${socket.id}`);
  });
};

module.exports = { registerVideoSocketEvents };
