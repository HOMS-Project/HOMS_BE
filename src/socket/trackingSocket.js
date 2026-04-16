const User = require('../models/User');

const registerTrackingSocketEvents = (io, socket) => {
  // Join the dispatcher room to receive live updates
  socket.on('join_dispatcher_room', () => {
    socket.join('dispatcher_room');
    console.log(`Socket ${socket.id} joined dispatcher_room`);
  });

  // Mobile App emits this event when location changes
  socket.on('update_location', async (data) => {
    try {
      const { userId, role, location } = data; // location: { latitude, longitude }

      if (!userId || !location || !location.latitude || !location.longitude) {
        return;
      }

      // 1. Update user's current location in Database
      const geoJsonLocation = {
        type: 'Point',
        coordinates: [location.longitude, location.latitude]
      };

      await User.findByIdAndUpdate(userId, {
        currentLocation: geoJsonLocation,
        updatedAt: new Date()
      });

      // 2. Broadcast the location change to the dispatcher room
      io.to('dispatcher_room').emit('location_updated', {
        userId,
        role,
        location: geoJsonLocation,
        timestamp: new Date()
      });

    } catch (err) {
      console.error('Error in update_location socket event:', err);
    }
  });
};

module.exports = {
  registerTrackingSocketEvents
};
