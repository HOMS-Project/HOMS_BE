const express = require('express');
const router = express.Router();
const adminContractController = require('../../controllers/admin/contractController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');


// NOTE: For development convenience the GET endpoints for listing and
// retrieving contract details are intentionally left public so the
// frontend Contract Management tab can work without requiring auth.
// Production: tighten these with `verifyToken` + `authorize` as needed.

// Template Management
router.post('/templates', verifyToken, authorize('admin'), adminContractController.createTemplate);
router.get('/templates', adminContractController.getTemplates);
// Update template
router.put('/templates/:id', verifyToken, authorize('admin'), adminContractController.updateTemplate);

// Get single contract by id (public - used by Admin UI to view details)
router.get('/:id', adminContractController.getContractById);
// Download contract file
router.get('/:id/download', adminContractController.downloadContract);
router.get('/:id/download/docx', adminContractController.downloadContractDocx);

// Contract Management
router.get('/', adminContractController.getContracts);
router.post('/generate', verifyToken, authorize('admin', 'staff'), adminContractController.generateContract);

// Route ký tên (both admin and customer may call this; keep auth so req.user exists)
router.post('/:id/sign', verifyToken, adminContractController.signContract);

module.exports = router;
