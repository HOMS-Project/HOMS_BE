const Promotion = require('../../models/Promotion');
const { Parser } = require('json2csv');

/**
 * Build a mongoose filter from query params
 */
function buildFilter(query = {}) {
	const filter = {};
	if (query.status && query.status !== 'All') filter.status = query.status;
	if (query.search) {
		const re = new RegExp(String(query.search), 'i');
		filter.$or = [ { code: re }, { description: re } ];
	}
	return filter;
}

exports.getPromotions = async (query) => {
	const page = parseInt(query && query.page, 10) || null;
	const limit = parseInt(query && query.limit, 10) || 0;
	const filter = buildFilter(query);

	if (page && limit) {
		const skip = (page - 1) * limit;
		const [data, total] = await Promise.all([
			Promotion.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
			Promotion.countDocuments(filter)
		]);
		return { data, total, page, limit };
	}

	// Return full list
	return Promotion.find(filter).sort({ createdAt: -1 }).lean();
};

/**
 * Find promotions whose validUntil is before now and mark them as Expired (if not already).
 * Returns the raw result from updateMany.
 */
exports.expireOverduePromotions = async () => {
	const now = new Date();
	// Only update promotions that have a validUntil and are not already marked Expired
	const res = await Promotion.updateMany(
		{ validUntil: { $lt: now }, status: { $ne: 'Expired' } },
		{ $set: { status: 'Expired', updatedAt: now } }
	);
	return res;
};

exports.createPromotion = async (data, adminId) => {
	const toCreate = { ...data };
	if (adminId) toCreate.createdBy = adminId;
	// Ensure code is uppercase to satisfy schema
	if (toCreate.code) toCreate.code = String(toCreate.code).toUpperCase();
	const created = await Promotion.create(toCreate);
	return created.toObject();
};

exports.updatePromotion = async (id, data, adminId) => {
	const update = { ...data };
	if (update.code) update.code = String(update.code).toUpperCase();
	if (adminId) update.updatedBy = adminId;
	const updated = await Promotion.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
	return updated;
};

exports.deletePromotion = async (id) => {
	const deleted = await Promotion.findByIdAndDelete(id).lean();
	return deleted;
};

exports.exportPromotionsCsv = async (query) => {
	const filter = buildFilter(query);
	const data = await Promotion.find(filter).sort({ createdAt: -1 }).lean();
	const fields = [ 'code', 'description', 'discountType', 'discountValue', 'maxDiscount', 'minOrderAmount', 'usageLimit', 'usageCount', 'validFrom', 'validUntil', 'status', 'createdAt' ];
	const parser = new Parser({ fields });
	const csv = parser.parse(data.map(d => ({
		...d,
		validFrom: d.validFrom ? d.validFrom.toISOString() : '',
		validUntil: d.validUntil ? d.validUntil.toISOString() : '',
		createdAt: d.createdAt ? d.createdAt.toISOString() : ''
	})));
	return { filename: `promotions_${new Date().toISOString().slice(0,10)}.csv`, csv };
};
