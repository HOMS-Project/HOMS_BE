const express = require("express");
const userController = require("../controllers/userController");
const { verifyToken } = require("../middlewares/authMiddleware");

const router = express.Router();
const multer = require('multer');
const path = require('path');

// Default parser for non-file multipart (FormData without files)
const upload = multer();

// Avatar upload functionality removed. If re-enabling, re-add multer storage and route.

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

// Avatar upload route removed

// Đổi mật khẩu
router.put("/change-password", userController.changePassword);

const statisticController = require("../controllers/dispatcher/statisticController");

// ...
// Lấy thống kê cho Dispatcher tổng
router.get("/dispatcher-stats", statisticController.getDispatcherStats);

module.exports = router;
