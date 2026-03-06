const express = require('express');
const router = express.Router();
const adminContractController = require('../../controllers/admin/contractController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

// Xác thực chung
router.use(verifyToken);

// --- CÁC ROUTES DÀNH RIÊNG CHO ADMIN ---
// Template Management
router.post('/templates', authorize('admin'), adminContractController.createTemplate);
router.get('/templates', authorize(['admin', 'staff']), adminContractController.getTemplates);

// Contract Management
router.get('/', authorize(['admin', 'staff']), adminContractController.getContracts);
router.post('/generate', authorize(['admin', 'staff']), adminContractController.generateContract);

// Route ký tên (Cả admin và customer đều có thể gọi vào đầu API này dựa trên role để lưu chữ ký)
router.post('/:id/sign', adminContractController.signContract);

module.exports = router;
