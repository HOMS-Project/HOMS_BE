const PriceList = require('../../models/PriceList');

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
    const existingPriceList = await PriceList.findOne({ code: data.code });
    if (existingPriceList) throw new Error('PriceList code already exists');

    const newPriceList = new PriceList(data);
    return await newPriceList.save();
};

/**
 * Admin cập nhật bảng giá
 */
exports.updatePriceList = async (id, updateData) => {
    const priceList = await PriceList.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
    );

    if (!priceList) throw new Error('PriceList not found');
    return priceList;
};

/**
 * Xóa/Vô hiệu hóa bảng giá
 */
exports.deletePriceList = async (id) => {
    const priceList = await PriceList.findByIdAndUpdate(
        id,
        { isActive: false },
        { new: true }
    );

    if (!priceList) throw new Error('PriceList not found');
    return priceList;
};
