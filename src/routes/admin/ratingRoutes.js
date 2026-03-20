const express = require('express');
const router = express.Router();
const ratingController = require('../../controllers/admin/ratingController');
const { verifyToken, authorize } = require('../../middlewares/authMiddleware');

router.use(verifyToken);
router.use(authorize('admin'));

router.route('/')
    .get(ratingController.getAllRatings);

router.route('/:id')
    .get(ratingController.getRatingById);

module.exports = router;
