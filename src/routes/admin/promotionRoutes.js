const express = require('express');
const router = express.Router();
const adminPromotionController = require('../../controllers/admin/promotionController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

// List promotions (public for admin UI, but you can protect with verifyToken)
router.get('/', adminPromotionController.getPromotions);

// Create promotion (admin only)
router.post('/', verifyToken, authorize('admin'), adminPromotionController.createPromotion);

// Update promotion (admin only)
router.put('/:id', verifyToken, authorize('admin'), adminPromotionController.updatePromotion);

// Delete promotion (admin only)
router.delete('/:id', verifyToken, authorize('admin'), adminPromotionController.deletePromotion);

// Export CSV (admin only)
router.get('/export', verifyToken, authorize('admin'), adminPromotionController.exportPromotions);

module.exports = router;
