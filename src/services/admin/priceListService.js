const PriceList = require('../../models/PriceList');
const mongoose = require('mongoose');

/**
 * Lấy danh sách bảng giá / phí vận chuyển
 */
exports.getAllPriceLists = async (query = {}) => {
    const { search, isActive } = query;
    let filter = {};

    if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
    }

    if (search) {
        filter.$or = [
            { code: { $regex: search, $options: 'i' } },
            { name: { $regex: search, $options: 'i' } }
        ];
    }

    return await PriceList.find(filter).sort({ createdAt: -1 });
};

/**
 * Lấy chi tiết 1 bảng giá
 */
exports.getPriceListById = async (id) => {
    const priceList = await PriceList.findById(id);
    if (!priceList) throw new Error('PriceList not found');
    return priceList;
};

/**
 * Admin tạo bảng giá mới (VD: Giá cơ bản, phụ phí, phí bốc dỡ)
 */
exports.createPriceList = async (data) => {
    // Basic validation
    if (!data || !data.code || !data.name) throw new Error('Missing required fields: code/name');

    const existingPriceList = await PriceList.findOne({ code: data.code });
    if (existingPriceList) throw new Error('PriceList code already exists');

    // If this new price list should be active, deactivate others
    if (data.isActive === true) {
        await PriceList.updateMany({ isActive: true }, { isActive: false });
    }

    const newPriceList = new PriceList(data);
    return await newPriceList.save();
};

/**
 * Admin cập nhật bảng giá
 */
exports.updatePriceList = async (id, updateData) => {
    // If updating to active, deactivate other active price lists
    if (updateData && updateData.isActive === true) {
        await PriceList.updateMany({ _id: { $ne: id }, isActive: true }, { isActive: false });
    }

    const priceList = await PriceList.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    );

    if (!priceList) throw new Error('PriceList not found');
    return priceList;
};

/**
 * Toggle isActive on a price list explicitly.
 * If setting to true, deactivate other active price lists.
 */
exports.toggleActive = async (id, isActive) => {
    // Use a transaction to ensure the deactivate/activate steps are atomic
    const session = await mongoose.startSession();
    try {
        let updatedDoc = null;
        await session.withTransaction(async () => {
            if (isActive === true) {
                // deactivate others first within the transaction
                await PriceList.updateMany({ _id: { $ne: id }, isActive: true }, { isActive: false }, { session });
            }

            updatedDoc = await PriceList.findByIdAndUpdate(
                id,
                { isActive },
                { new: true, runValidators: true, session }
            );
            if (!updatedDoc) {
                // throwing will abort the transaction
                throw new Error('PriceList not found');
            }
        });

        // return the updated document (outside transaction)
        return await PriceList.findById(id);
    } finally {
        session.endSession();
    }
};

/**
 * Xóa/Vô hiệu hóa bảng giá
 */
exports.deletePriceList = async (id) => {
    // Perform a hard delete so DELETE truly removes the resource.
    const priceList = await PriceList.findByIdAndDelete(id);
    if (!priceList) throw new Error('PriceList not found');
    return priceList;
};
