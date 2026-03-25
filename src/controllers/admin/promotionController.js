const adminPromotionService = require('../../services/admin/promotionService');

exports.getPromotions = async (req, res, next) => {
	try {
		// Ensure any promotions that passed their validUntil are reflected as Expired in DB
		try {
			await adminPromotionService.expireOverduePromotions();
		} catch (e) {
			// log but don't block listing if expire check fails
			console.error('Failed to expire overdue promotions:', e);
		}
		const promos = await adminPromotionService.getPromotions(req.query);
		if (promos && typeof promos === 'object' && Array.isArray(promos.data)) {
			const { data, total, page, limit } = promos;
			return res.status(200).json({ success: true, data, meta: { total, page, limit } });
		}
		if (Array.isArray(promos)) return res.status(200).json({ success: true, data: promos });
		return res.status(200).json({ success: true, data: promos });
	} catch (error) {
		next(error);
	}
};

exports.createPromotion = async (req, res, next) => {
	try {
		const created = await adminPromotionService.createPromotion(req.body, req.user && (req.user.userId || req.user.id));
		return res.status(201).json({ success: true, data: created });
	} catch (error) {
		next(error);
	}
};

exports.updatePromotion = async (req, res, next) => {
	try {
		const id = req.params.id;
		const updated = await adminPromotionService.updatePromotion(id, req.body, req.user && (req.user.userId || req.user.id));
		if (!updated) return res.status(404).json({ success: false, message: 'Promotion not found' });
		return res.status(200).json({ success: true, data: updated });
	} catch (error) {
		next(error);
	}
};

exports.deletePromotion = async (req, res, next) => {
	try {
		const id = req.params.id;
		const deleted = await adminPromotionService.deletePromotion(id);
		if (!deleted) return res.status(404).json({ success: false, message: 'Promotion not found' });
		return res.status(200).json({ success: true, data: deleted });
	} catch (error) {
		next(error);
	}
};

exports.exportPromotions = async (req, res, next) => {
	try {
		// Refresh expiry status in DB before exporting so CSV reflects correct statuses
		try {
			await adminPromotionService.expireOverduePromotions();
		} catch (e) {
			console.error('Failed to expire overdue promotions before export:', e);
		}
		const { filename, csv } = await adminPromotionService.exportPromotionsCsv(req.query);
		res.setHeader('Content-Type', 'text/csv; charset=utf-8');
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		return res.send(csv);
	} catch (error) {
		next(error);
	}
};
