let io;

const initSocket = (serverIo) => {
  io = serverIo;
};

const getIo = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};

module.exports = { initSocket, getIo };