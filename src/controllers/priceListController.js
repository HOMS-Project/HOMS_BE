/**
 * PriceListController - API handlers cho bảng giá
 */

const PriceList = require('../models/PriceList');
const AppError = require('../utils/appErrors');

/**
 * POST /api/price-lists
 * Tạo bảng giá mới
 */
exports.createPriceList = async (req, res, next) => {
  try {
    const {
      code,
      name,
      description,
      serviceScope,
      isActive,
      basePrice,
      vehiclePricing,
      laborPricing,
      movingSurcharge,
      additionalServices
    } = req.body;

    // Validate required fields
    if (!code || !name || !basePrice || !vehiclePricing || !laborPricing) {
      throw new AppError('Thiếu dữ liệu bắt buộc', 400);
    }

    // Nếu isActive = true, deactivate các bảng giá cũ
    if (isActive === true) {
      await PriceList.updateMany({ isActive: true }, { isActive: false });
    }

    const priceList = new PriceList({
      code,
      name,
      description,
      serviceScope: serviceScope || 'SPECIFIC_ITEMS',
      isActive: isActive !== false, // Default true
      basePrice,
      vehiclePricing,
      laborPricing,
      movingSurcharge,
      additionalServices
    });

    await priceList.save();

    res.status(201).json({
      success: true,
      message: 'Bảng giá đã được tạo',
      data: priceList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/price-lists/:id
 * Lấy chi tiết bảng giá
 */
exports.getPriceList = async (req, res, next) => {
  try {
    const { id } = req.params;

    const priceList = await PriceList.findById(id);

    if (!priceList) {
      throw new AppError('Bảng giá không tồn tại', 404);
    }

    res.json({
      success: true,
      data: priceList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/price-lists
 * Lấy danh sách bảng giá
 */
exports.listPriceLists = async (req, res, next) => {
  try {
    const { isActive, limit, skip } = req.query;

    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const priceLists = await PriceList.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) || 20)
      .skip(parseInt(skip) || 0);

    const total = await PriceList.countDocuments(query);

    res.json({
      success: true,
      data: priceLists,
      total
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/price-lists/active
 * Lấy bảng giá đang hoạt động
 */
exports.getActivePriceList = async (req, res, next) => {
  try {
    const priceList = await PriceList.findOne({ isActive: true });

    if (!priceList) {
      throw new AppError('Không tìm thấy bảng giá đang hoạt động', 404);
    }

    res.json({
      success: true,
      data: priceList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/price-lists/:id
 * Cập nhật bảng giá
 */
exports.updatePriceList = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Nếu cập nhật isActive = true, deactivate các bảng giá cũ
    if (updates.isActive === true) {
      await PriceList.updateMany({ _id: { $ne: id }, isActive: true }, { isActive: false });
    }

    const priceList = await PriceList.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!priceList) {
      throw new AppError('Bảng giá không tồn tại', 404);
    }

    res.json({
      success: true,
      message: 'Bảng giá đã được cập nhật',
      data: priceList
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/price-lists/:id
 * Xóa bảng giá
 */
exports.deletePriceList = async (req, res, next) => {
  try {
    const { id } = req.params;

    const priceList = await PriceList.findById(id);

    if (!priceList) {
      throw new AppError('Bảng giá không tồn tại', 404);
    }

    if (priceList.isActive) {
      throw new AppError('Không thể xóa bảng giá đang hoạt động', 400);
    }

    await PriceList.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Bảng giá đã được xóa'
    });
  } catch (error) {
    next(error);
  }
};
