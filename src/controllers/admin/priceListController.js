const adminPriceListService = require('../../services/admin/priceListService');

exports.getAllPriceLists = async (req, res, next) => {
    try {
        const priceLists = await adminPriceListService.getAllPriceLists(req.query);
        res.status(200).json({ success: true, data: priceLists });
    } catch (error) {
        next(error);
    }
};

exports.getPriceListById = async (req, res, next) => {
    try {
        const priceList = await adminPriceListService.getPriceListById(req.params.id);
        res.status(200).json({ success: true, data: priceList });
    } catch (error) {
        if (error.message === 'PriceList not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.createPriceList = async (req, res, next) => {
    try {
        const newPriceList = await adminPriceListService.createPriceList(req.body);
        res.status(201).json({ success: true, data: newPriceList });
    } catch (error) {
        if (error.message === 'PriceList code already exists') {
            return res.status(400).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.updatePriceList = async (req, res, next) => {
    try {
        const updatedPriceList = await adminPriceListService.updatePriceList(req.params.id, req.body);
        res.status(200).json({ success: true, data: updatedPriceList });
    } catch (error) {
        if (error.message === 'PriceList not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

// PATCH /api/admin/price-lists/:id/toggle-active
exports.toggleActive = async (req, res, next) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ success: false, message: 'Missing or invalid isActive boolean' });
        }

        const updatedPriceList = await adminPriceListService.toggleActive(req.params.id, isActive);
        res.status(200).json({ success: true, data: updatedPriceList });
    } catch (error) {
        if (error.message === 'PriceList not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.deletePriceList = async (req, res, next) => {
    try {
        const priceList = await adminPriceListService.deletePriceList(req.params.id);
        res.status(200).json({ success: true, message: 'PriceList deleted', data: priceList });
    } catch (error) {
        if (error.message === 'PriceList not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};
