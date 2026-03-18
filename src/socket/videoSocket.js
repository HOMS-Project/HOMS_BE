const registerVideoSocketEvents = (io, socket) => {
  console.log(`[VideoChat] User connected: ${socket.id} (User ID: ${socket.user?.id})`);

  // When a user wants to join a specific room (for chat & video)
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`[VideoChat] User ${socket.id} joined room ${roomId}`);
    // Notify others in the room
    socket.to(roomId).emit('user_joined', { userId: socket.id, user: socket.user });
  });

  // Handle chat messages
  socket.on('send_message', (data) => {
    // data should have { roomId, message, sender }
    io.to(data.roomId).emit('receive_message', data);
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
