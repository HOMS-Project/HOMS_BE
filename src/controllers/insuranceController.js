const insuranceService = require('../services/insuranceService');

exports.getPackages = async (req, res, next) => {
  try {
    const packages = insuranceService.getAvailablePackages();
    res.json({
      success: true,
      data: packages
    });
  } catch (error) {
    next(error);
  }
};

exports.calculatePremium = async (req, res, next) => {
  try {
    const { declaredValue, packageId } = req.body;
    if (!declaredValue) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập giá trị khai báo' });
    }
    const result = insuranceService.calculatePremium(declaredValue, packageId);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};
