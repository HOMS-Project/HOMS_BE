const express = require('express');
const userController = require('../controllers/userController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

// Áp dụng middleware xác thực cho tất cả routes
router.use(verifyToken);

// Lấy thông tin user
router.get('/personal-info', userController.getUserInfo);

// Lấy danh sách nhân viên khảo sát
router.get('/dispatchers', userController.getDispatchers);

// Lấy danh sách tài xế
router.get('/drivers', userController.getDrivers);

// Lấy danh sách nhân viên bốc xếp
router.get('/staff', userController.getStaff);

// Cập nhật thông tin user
router.put('/personal-info', userController.updateUserInfo);

// Thay đổi mật khẩu
router.put('/change-password', userController.changePassword);

module.exports = router;
