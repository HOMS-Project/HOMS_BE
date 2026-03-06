const express = require('express');
const router = express.Router();
const adminUserController = require('../../controllers/admin/userController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

// Chỉ Admin mới được truy cập các routes này
router.use(verifyToken);
router.use(authorize('admin'));

// Route: /api/admin/users
router.route('/')
    .get(adminUserController.getAllUsers)
    .post(adminUserController.createUser);

// Route: /api/admin/users/:id
router.route('/:id')
    .get(adminUserController.getUserById)
    .put(adminUserController.updateUser)
    .delete(adminUserController.deleteUser); // Logic delete/block

module.exports = router;
