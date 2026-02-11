/**
 * Routes cho Invoice
 */

const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

// 1. Tạo invoice
router.post('/', authenticate, invoiceController.createInvoice);

// 2. Lên lịch khảo sát
router.post('/:invoiceId/survey/schedule', authenticate, invoiceController.scheduleSurvey);

// 3. Hoàn tất khảo sát
router.put('/:invoiceId/survey/complete', authenticate, invoiceController.completeSurvey);

// 4. Tính giá
router.post('/:invoiceId/pricing/calculate', authenticate, invoiceController.calculatePrice);

// 5. Kiểm tra tuyến đường
router.post('/route/:routeId/validate', authenticate, invoiceController.validateRoute);

// 6. Tìm tuyến đường tối ưu
router.get('/:invoiceId/route/optimal', authenticate, invoiceController.findOptimalRoute);

// 7. Điều phối xe & nhân sự
router.post('/:invoiceId/dispatch/vehicles', authenticate, invoiceController.dispatchVehicles);

// 8. Xác nhận điều phối
router.put('/:invoiceId/dispatch/confirm', authenticate, invoiceController.confirmDispatch);

// 9. Lấy thông tin invoice
router.get('/:invoiceId', authenticate, invoiceController.getInvoice);

// 10. Cập nhật trạng thái invoice
router.put('/:invoiceId/status', authenticate, invoiceController.updateInvoiceStatus);

module.exports = router;
