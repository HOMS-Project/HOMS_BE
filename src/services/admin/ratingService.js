const ServiceRating = require('../../models/ServiceRating');
const Invoice = require('../../models/Invoice');
const User = require('../../models/User');
const mongoose = require('mongoose');

/**
 * Get paginated list of service ratings with optional filters
 * Supports: page, limit, search (comment/quickTags/invoice code), minRating, invoiceId, customerId
 */
exports.getAllRatings = async (query) => {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.max(1, parseInt(query.limit, 10) || 10);
    const skip = (page - 1) * limit;

    const { search, minRating, invoiceId, customerId } = query;

    const match = {};
    if (minRating) {
        match.rating = { $gte: Number(minRating) };
    }
    if (invoiceId && mongoose.Types.ObjectId.isValid(invoiceId)) {
        match.invoiceId = mongoose.Types.ObjectId(invoiceId);
    }
    if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
        match.customerId = mongoose.Types.ObjectId(customerId);
    }

    // Build aggregation pipeline
    const pipeline = [];
    if (Object.keys(match).length) pipeline.push({ $match: match });

    // Optional search: look into comment, quickTags, and invoice.code (via lookup)
    if (search) {
        const regex = { $regex: String(search), $options: 'i' };
        // match comment or quickTags
        pipeline.push({
            $match: {
                $or: [
                    { comment: regex },
                    { quickTags: regex }
                ]
            }
        });
    }

    // lookup invoice
    pipeline.push({
        $lookup: {
            from: 'invoices',
            localField: 'invoiceId',
            foreignField: '_id',
            as: 'invoice'
        }
    });
    pipeline.push({ $unwind: { path: '$invoice', preserveNullAndEmptyArrays: true } });

    // If search provided, also filter by invoice.code
    if (search) {
        const regex = { $regex: String(search), $options: 'i' };
        pipeline.push({
            $match: {
                $or: [
                    { 'invoice.code': regex },
                    { comment: regex },
                    { quickTags: regex }
                ]
            }
        });
    }

    // lookup customer and driver
    pipeline.push({
        $lookup: { from: 'users', localField: 'customerId', foreignField: '_id', as: 'customer' }
    });
    pipeline.push({ $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } });

    pipeline.push({
        $lookup: { from: 'users', localField: 'driverId', foreignField: '_id', as: 'driver' }
    });
    pipeline.push({ $unwind: { path: '$driver', preserveNullAndEmptyArrays: true } });

    // sort
    pipeline.push({ $sort: { createdAt: -1 } });

    // facet for pagination
    pipeline.push({
        $facet: {
            docs: [ { $skip: skip }, { $limit: limit } ],
            totalCount: [ { $count: 'count' } ]
        }
    });

    const results = await ServiceRating.aggregate(pipeline).exec();
    const docs = (results[0] && results[0].docs) || [];
    const total = (results[0] && results[0].totalCount && results[0].totalCount[0] && results[0].totalCount[0].count) || 0;

    // sanitize docs: remove sensitive fields
    const ratings = docs.map(d => {
        const obj = { ...d };
        if (obj.customer && obj.customer.password) delete obj.customer.password;
        if (obj.customer && obj.customer.refreshTokens) delete obj.customer.refreshTokens;
        if (obj.driver && obj.driver.password) delete obj.driver.password;
        if (obj.driver && obj.driver.refreshTokens) delete obj.driver.refreshTokens;
        return obj;
    });

    return {
        ratings,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit,
        totalRatings: total
    };
};

exports.getRatingById = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('Rating not found');
    const rating = await ServiceRating.findById(id).populate('customerId', '-password -refreshTokens').populate('driverId', '-password -refreshTokens').populate('invoiceId').lean();
    if (!rating) throw new Error('Rating not found');

    // normalize keys to match aggregation shape used in frontend
    const obj = { ...rating };
    obj.customer = obj.customerId;
    obj.driver = obj.driverId;
    obj.invoice = obj.invoiceId;
    delete obj.customerId; delete obj.driverId; delete obj.invoiceId;
    return obj;
};