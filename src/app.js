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
const helmet = require('helmet');
const csurf = require('csurf');
// Cấu hình Socket.io
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      callback(null, origin || true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true
  }
});
initSocket(io);
global.onlineUsers = new Map();
const User = require('./models/User');

const socketAuthMiddleware = require('./middlewares/socketAuthMiddleware');
const { registerVideoSocketEvents } = require('./socket/videoSocket');

const videoIo = io.of('/video-chat');
videoIo.use(socketAuthMiddleware);
videoIo.on('connection', (socket) => {
  registerVideoSocketEvents(videoIo, socket);
});

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
const path = require('path');
connectDB();
app.use(cors({
  origin: function (origin, callback) {
    callback(null, origin || true);
  },
  credentials: true
}));

const requestTicketController = require("./controllers/requestTicketController");

app.post(
  "/api/request-tickets/payos-webhook",
  express.raw({ type: "application/json" }),
  requestTicketController.payosWebhook
);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],                         // Mặc định chỉ chấp nhận cùng origin
      scriptSrc: ["'self'", "https://accounts.google.com"], // Cho phép Google OAuth script
      styleSrc: ["'self'", "'unsafe-inline'"],        // Cần unsafe-inline nếu dùng inline style
      imgSrc: ["'self'", "data:", "https:"],           // Cho phép ảnh từ https
      connectSrc: ["'self'", "*"],                     // Allow API calls to dynamically matching origins on Vercel
      frameSrc: ["https://accounts.google.com"],      // Google OAuth dùng iframe
      objectSrc: ["'none'"],                          // Chặn <object>, <embed> (nguy hiểm)
      upgradeInsecureRequests: [],                    // Tự động upgrade HTTP → HTTPS
    },
  },
  // ✅ Strict-Transport-Security (HSTS)
  // Bắt browser luôn dùng HTTPS, không fallback về HTTP
  // maxAge: 1 năm (tính bằng giây), includeSubDomains: áp dụng cho subdomain
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
}));
// Increase body size limits to allow uploading template-level signature images
// NOTE: storing large base64 blobs in JSON is not ideal for production. Prefer using
// presigned uploads or multipart/form-data endpoints. This increase is a short-term
// convenience to avoid 413 errors when admins save templates with embedded signatures.
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(cookieParser());

// Serve uploaded files (avatars etc.) from /uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Determine if deployed on a cloud provider like Vercel or Render
const isCloudHosted = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || process.env.RENDER === 'true';
const useSecureCookies = isCloudHosted || process.env.USE_SECURE_COOKIES === 'true';

const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    sameSite: useSecureCookies ? 'none' : 'lax', // Lax for local dev (HTTP), None for cross-site (HTTPS)
    secure: useSecureCookies
  }
});
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

app.get("/", (req, res) => {
  res.send("HOMS Backend is running 🚚");
});
const { startContractDepositExpiryJob } = require('./jobs/contractDepositExpiry');
startContractDepositExpiryJob();
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
const adminPromotionRoutes = require("./routes/admin/promotionRoutes");
const adminMaintenanceRoutes = require("./routes/admin/maintenanceRoutes");
const adminAiRoutes = require("./routes/admin/adminAiRoutes");
const staffRoutes = require("./routes/staffRoutes");
const uploadRoutes = require("./routes/uploads");
const publicRoutes = require("./routes/publicRoutes");
const aiRoutes = require("./routes/aiRoutes");
const promotionRoutes = require('./routes/promotionRoutes');

app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/customer", csrfProtection, userRoutes);
app.use("/api/request-tickets", csrfProtection, requestTicketRoutes);
app.use("/api/invoices", csrfProtection, invoiceRoutes);
app.use("/api/surveys", surveyRoutes);
app.use("/api/price-lists", priceListRoutes);
app.use("/api/pricing", pricingRoutes);
app.use("/api/customer/contracts", contractRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/incidents", csrfProtection, incidentRoutes);
app.use("/api/service-ratings", serviceRatingRoutes);
app.use("/api/ai", aiRoutes);
app.use('/api/promotions', promotionRoutes);

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
app.use("/api/admin/promotions", adminPromotionRoutes);
app.use("/api/admin/maintenances", adminMaintenanceRoutes);
app.use("/api/admin/ai", adminAiRoutes);

app.use(errorMiddleware);
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
