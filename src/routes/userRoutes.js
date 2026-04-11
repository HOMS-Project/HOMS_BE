const express = require("express");
const userController = require("../controllers/userController");
const { verifyToken } = require("../middlewares/authMiddleware");

const router = express.Router();
const multer = require("multer");

// Default parser for non-file multipart (FormData without files)
const upload = multer();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP."));
  },
});

// Áp dụng middleware xác thực cho tất cả routes
router.use(verifyToken);

// Lấy thông tin user
router.get("/personal-info", userController.getUserInfo);

// Lấy danh sách nhân viên khảo sát
router.get("/dispatchers", userController.getDispatchers);

// Lấy danh sách tài xế
router.get("/drivers", userController.getDrivers);

// Lấy danh sách nhân viên bốc xếp
router.get("/staff", userController.getStaff);

// Cập nhật thông tin user
// Accept multipart/form-data (from FE using FormData) as well as JSON
router.put("/personal-info", upload.none(), userController.updateUserInfo);

// Upload / đổi avatar
router.post(
  "/avatar",
  avatarUpload.single("avatar"),
  userController.updateAvatar,
);

// Đăng xuất tất cả phiên của user hiện tại
router.post("/logout-all-sessions", userController.logoutAllSessions);

// Đổi mật khẩu
router.put("/change-password", userController.changePassword);

const statisticController = require("../controllers/dispatcher/statisticController");

// ...
// Lấy thống kê cho Dispatcher tổng
router.get("/dispatcher-stats", statisticController.getDispatcherStats);

module.exports = router;
