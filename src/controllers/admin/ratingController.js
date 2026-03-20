const ratingService = require('../../services/admin/ratingService');

exports.getAllRatings = async (req, res, next) => {
    try {
        const result = await ratingService.getAllRatings(req.query);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

exports.getRatingById = async (req, res, next) => {
    try {
        const result = await ratingService.getRatingById(req.params.id);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        if (err.message === 'Rating not found') return res.status(404).json({ success: false, message: err.message });
        next(err);
    }
};
