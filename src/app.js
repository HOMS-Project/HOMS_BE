require("dotenv").config();
const express = require("express");
const http = require("http");
const connectDB = require("./config/database");
const errorMiddleware = require("./middlewares/errorMiddleware");
const cors = require('cors');
const app = express();
const { initSocket } = require("./utils/socket");
app.set('trust proxy', 1);
const { Server } = require('socket.io');
const server = http.createServer(app);

// Cấu hình Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Cấu hình lại domain FE của bạn ở đây để bảo mật
    methods: ["GET", "POST"]
  }
});
initSocket(io);
global.onlineUsers = new Map();
const User = require('./models/User');

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Khi user login/vào web, FE sẽ gửi event 'register_user' kèm userId
  socket.on('register_user', (userId) => {
    (async () => {
      try {
        const user = await User.findById(userId).select('status');
        if (user && (user.status || '').toString().toLowerCase() === 'active') {
          global.onlineUsers.set(userId.toString(), socket.id);
          console.log(`User ${userId} registered with socket ${socket.id}`);
        } else {
          console.log(`Socket registration blocked for user ${userId} due to inactive status`);
        }
      } catch (err) {
        console.error('Error verifying user status for socket registration', err.message || err);
      }
    })();
  });

  socket.on('disconnect', () => {
    // Xóa user khỏi danh sách online khi ngắt kết nối
    for (let [userId, socketId] of global.onlineUsers.entries()) {
      if (socketId === socket.id) {
        global.onlineUsers.delete(userId);
        break;
      }
    }
  });
});

const cookieParser = require('cookie-parser');
connectDB();
app.use(cors({
  origin: '*',
  credentials: true
}));

const requestTicketController = require("./controllers/requestTicketController");

app.post(
  "/api/request-tickets/payos-webhook",
  express.raw({ type: "application/json" }),
  requestTicketController.payosWebhook
);
app.use(express.json());
app.use(cookieParser());
app.get("/", (req, res) => {
  res.send("HOMS Backend is running 🚚");
});

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const requestTicketRoutes = require("./routes/requestTicketRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const surveyRoutes = require("./routes/surveyRoutes");
const priceListRoutes = require("./routes/priceListRoutes");
const pricingRoutes = require("./routes/pricingRoutes");
const contractRoutes = require("./routes/contractRoutes");
const notificationRoutes = require("./routes/notificationRoutes")
const incidentRoutes = require("./routes/incidentRoutes");
const serviceRatingRoutes = require("./routes/serviceRatingRoutes");
// Admin routes
const adminUserRoutes = require("./routes/admin/userRoutes");
const adminStatisticRoutes = require("./routes/admin/statisticRoutes");
const adminDashboardRoutes = require("./routes/admin/dashboardRoutes");
const adminContractRoutes = require("./routes/admin/contractRoutes");
const adminRouteRoutes = require("./routes/admin/routeRoutes");
const adminPriceListRoutes = require("./routes/admin/priceListRoutes");
const adminVehicleRoutes = require("./routes/admin/vehicleRoutes");
const adminIncidentRoutes = require("./routes/admin/incidentRoutes");
const adminInvoiceRoutes = require("./routes/admin/invoiceRoutes");
const adminRatingRoutes = require("./routes/admin/ratingRoutes");
const staffRoutes = require("./routes/staffRoutes");
const uploadRoutes = require("./routes/uploads");
const publicRoutes = require("./routes/publicRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/customer", userRoutes);
app.use("/api/request-tickets", requestTicketRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/surveys", surveyRoutes);
app.use("/api/price-lists", priceListRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/customer/contracts", contractRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/service-ratings", serviceRatingRoutes);

app.use("/api/admin/users", adminUserRoutes);
app.use("/api/admin/statistics", adminStatisticRoutes);
app.use("/api/admin/dashboard", adminDashboardRoutes);
app.use("/api/admin/contracts", adminContractRoutes);
app.use("/api/admin/routes", adminRouteRoutes);
app.use("/api/admin/price-lists", adminPriceListRoutes);
app.use("/api/admin/vehicles", adminVehicleRoutes);
app.use("/api/admin/incidents", adminIncidentRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/admin/invoices", adminInvoiceRoutes);
app.use("/api/admin/ratings", adminRatingRoutes);

app.use(errorMiddleware);
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;

