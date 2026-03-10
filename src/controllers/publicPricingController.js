/**
 * Controller xử lý tính giá công khai cho khách hàng vãng lai (Landing Page)
 */

exports.estimatePrice = async (req, res, next) => {
  try {
    const { distanceKm, vehicleType, isRoundTrip, floors } = req.body;

    // Validate
    if (distanceKm == null) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp khoảng cách (km)' });
    }

    // Giá cơ bản: 25,000đ/km
    const BASE_PRICE_PER_KM = 25000;
    let distanceCost = Number(distanceKm) * BASE_PRICE_PER_KM;

    if (isRoundTrip) {
      distanceCost *= 2; // Khứ hồi x2
    }

    // Giá thuê xe mặc định (Dựa trên loại xe tải)
    const VEHICLE_PRICES = {
      '500KG': 300000,
      '1TON': 500000,
      '1.5TON': 700000,
      '2TON': 1000000
    };

    let vehicleCost = VEHICLE_PRICES[vehicleType] || VEHICLE_PRICES['500KG'];

    // Phụ phí tầng bộ (không liên quan thang máy)
    const FLOOR_FEE = 100000; // 100k/tầng vác bộ
    let floorCost = 0;
    if (floors && Number(floors) > 1) {
       floorCost = (Number(floors) - 1) * FLOOR_FEE;
    }

    // Tổng cộng
    const subtotal = distanceCost + vehicleCost + floorCost;
    const tax = subtotal * 0.1; // 10% VAT
    const totalPrice = subtotal + tax;

    res.status(200).json({
      success: true,
      data: {
        distanceKm: Number(distanceKm),
        vehicleType: vehicleType || '500KG',
        breakdown: {
          distanceCost,
          vehicleCost,
          floorCost,
          subtotal,
          tax
        },
        estimatedTotal: totalPrice
      }
    });
  } catch (error) {
    next(error);
  }
};
