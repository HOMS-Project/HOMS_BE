/**
 * Service tính giá
 * - Tính basePrice dựa trên weight, volume, distance
 * - Cộng phí dịch vụ, nhân sự, phương tiện
 * - Áp dụng phụ phí & khuyến mãi
 * - Cộng thuế
 */

const PricingData = require('../models/PricingData');
const Invoice = require('../models/Invoice');
const PriceList = require('../models/PriceList');
const Promotion = require('../models/Promotion');
const Route = require('../models/Route');
const AppError = require('../utils/appErrors');

const TAX_RATE = 0.1; // 10% VAT

class PricingService {
  /**
   * Tính giá cho invoice
   */
  async calculatePrice(invoiceId, pricingInput) {
    try {
      const invoice = await Invoice.findById(invoiceId)
        .populate('routeId')
        .populate('requestTicketId');

      if (!invoice) {
        throw new AppError('Invoice not found', 404);
      }

      // Lấy pricing data hoặc tạo mới
      let pricingData = await PricingData.findOne({ invoiceId });
      if (!pricingData) {
        pricingData = new PricingData({ invoiceId });
      }

      // ===== 1. Tính basePrice =====
      pricingData.estimatedDistance = pricingInput.estimatedDistance;
      pricingData.totalWeight = pricingInput.totalWeight;
      pricingData.totalVolume = pricingInput.totalVolume;

      pricingData.basePrice = this.calculateBasePrice(
        pricingInput.estimatedDistance,
        pricingInput.totalWeight,
        pricingInput.totalVolume
      );

      // ===== 2. Tính phí dịch vụ =====
      pricingData.services = this.calculateServiceFees(
        pricingInput.services,
        pricingInput.totalWeight
      );

      // ===== 3. Tính phí nhân sự =====
      pricingData.staffFee = this.calculateStaffFee(
        pricingInput.staffCount,
        invoice.pickup?.coordinates,
        invoice.delivery?.coordinates
      );

      // ===== 4. Tính phí phương tiện =====
      pricingData.vehicleFee = this.calculateVehicleFee(
        pricingInput.vehicleType,
        pricingInput.estimatedDuration
      );

      // ===== 5. Phụ phí (tuyến, địa hình, khó khăn) =====
      pricingData.surcharge = pricingInput.surcharge || 0;

      // ===== 6. Khuyến mãi =====
      if (pricingInput.promotionId) {
        const promotion = await Promotion.findById(pricingInput.promotionId);
        if (promotion && this.isPromotionValid(promotion)) {
          pricingData.promotionId = pricingInput.promotionId;
          pricingData.discountPercent = promotion.discountPercent;
        }
      }

      if (pricingInput.discountCode) {
        // TODO: Xác thực discount code
        pricingData.discountCode = pricingInput.discountCode;
      }

      // ===== 7. Tính tổng =====
      const { subtotal, tax, totalPrice } = this.calculateTotal(
        pricingData,
        TAX_RATE
      );

      pricingData.subtotal = subtotal;
      pricingData.tax = tax;
      pricingData.totalPrice = totalPrice;
      pricingData.calculatedAt = new Date();
      pricingData.calculatedBy = pricingInput.calculatedBy;

      await pricingData.save();

      // Cập nhật cached price trong invoice
      invoice.pricingDataId = pricingData._id;
      invoice.cachedPrice = {
        totalPrice,
        tax,
        subtotal,
        lastUpdated: new Date()
      };
      await invoice.save();

      return pricingData;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Tính basePrice dựa trên weight, volume, distance
   * Lấy từ PriceList
   */
  calculateBasePrice(distance, weight, volume) {
    // Đơn giá cơ bản (có thể lấy từ config hoặc database)
    const BASE_PRICE_PER_KM = 25000;        // 25k/km
    const BASE_PRICE_PER_KG = 3000;         // 3k/kg
    const BASE_PRICE_PER_M3 = 150000;       // 150k/m3

    // Tính giá theo 3 tiêu chí, lấy cái cao nhất
    const priceByDistance = distance * BASE_PRICE_PER_KM;
    const priceByWeight = weight * BASE_PRICE_PER_KG;
    const priceByVolume = volume * BASE_PRICE_PER_M3;

    return Math.max(priceByDistance, priceByWeight, priceByVolume);
  }

  /**
   * Tính phí dịch vụ (đóng gói, lắp ráp, bảo hiểm, chụp ảnh)
   */
  calculateServiceFees(services, totalWeight) {
    const result = {};

    if (services.packing) {
      result.packing = {
        isAppliedAll: services.packing.isAppliedAll,
        itemIds: services.packing.itemIds,
        price: services.packing.isAppliedAll ? totalWeight * 5000 : 0 // 5k/kg
      };
    }

    if (services.assembling) {
      result.assembling = {
        isAppliedAll: services.assembling.isAppliedAll,
        itemIds: services.assembling.itemIds,
        price: services.assembling.isAppliedAll ? 500000 : 0 // 500k cho toàn bộ
      };
    }

    if (services.insurance) {
      result.insurance = {
        isAppliedAll: services.insurance.isAppliedAll,
        itemIds: services.insurance.itemIds,
        price: services.insurance.isAppliedAll ? totalWeight * 2000 : 0 // 2k/kg
      };
    }

    if (services.photography) {
      result.photography = {
        isAppliedAll: services.photography.isAppliedAll,
        itemIds: services.photography.itemIds,
        price: services.photography.isAppliedAll ? 200000 : 0 // 200k
      };
    }

    return result;
  }

  /**
   * Tính phí nhân sự dựa trên số người & khó khăn địa hình
   */
  calculateStaffFee(staffCount, pickupCoords, deliveryCoords) {
    const PRICE_PER_PERSON = 500000; // 500k/người

    let totalFee = staffCount * PRICE_PER_PERSON;

    // Cộng thêm nếu khó khăn (tầng cao, hẻm hẹp) - sẽ được cập nhật từ survey
    // TODO: Tích hợp với SurveyData

    return {
      count: staffCount,
      pricePerPerson: PRICE_PER_PERSON,
      totalStaffFee: totalFee
    };
  }

  /**
   * Tính phí phương tiện dựa trên loại xe & thời gian
   */
  calculateVehicleFee(vehicleType, estimatedDurationMinutes) {
    const VEHICLE_PRICES = {
      'SMALL_TRUCK': { perDay: 1500000, perHour: 100000 },
      'MEDIUM_TRUCK': { perDay: 2000000, perHour: 150000 },
      'LARGE_TRUCK': { perDay: 3000000, perHour: 200000 },
      'VAN': { perDay: 1200000, perHour: 80000 }
    };

    const price = VEHICLE_PRICES[vehicleType] || VEHICLE_PRICES['SMALL_TRUCK'];
    const hours = estimatedDurationMinutes / 60;
    const totalFee = hours * price.perHour;

    return {
      vehicleType,
      pricePerDay: price.perDay,
      pricePerHour: price.perHour,
      totalVehicleFee: totalFee
    };
  }

  /**
   * Tính tổng giá cuối cùng
   */
  calculateTotal(pricingData, taxRate) {
    let subtotal = pricingData.basePrice;

    // Cộng phí dịch vụ
    Object.values(pricingData.services).forEach(service => {
      subtotal += service.price || 0;
    });

    // Cộng phí nhân sự & phương tiện
    subtotal += pricingData.staffFee.totalStaffFee;
    subtotal += pricingData.vehicleFee.totalVehicleFee;

    // Cộng phụ phí
    subtotal += pricingData.surcharge;

    // Trừ khuyến mãi
    if (pricingData.discountPercent) {
      const discount = subtotal * (pricingData.discountPercent / 100);
      pricingData.discountAmount = discount;
      subtotal -= discount;
    }

    if (pricingData.discountAmount && !pricingData.discountPercent) {
      subtotal -= pricingData.discountAmount;
    }

    // Tính thuế
    const tax = subtotal * taxRate;
    const totalPrice = subtotal + tax;

    return {
      subtotal: Math.round(subtotal),
      tax: Math.round(tax),
      totalPrice: Math.round(totalPrice)
    };
  }

  /**
   * Kiểm tra promotion còn hiệu lực
   */
  isPromotionValid(promotion) {
    const now = new Date();
    return (
      promotion.isActive &&
      (!promotion.startDate || promotion.startDate <= now) &&
      (!promotion.endDate || promotion.endDate >= now)
    );
  }

  /**
   * Lấy pricing data của invoice
   */
  async getPricingByInvoice(invoiceId) {
    return PricingData.findOne({ invoiceId });
  }

  /**
   * Cập nhật giá sau khi khảo sát
   */
  async reproductPrice(invoiceId, surveyData) {
    // TODO: Tính lại giá dựa trên weight/volume thực tế từ survey
    return this.calculatePrice(invoiceId, {
      totalWeight: surveyData.totalActualWeight,
      totalVolume: surveyData.totalActualVolume,
      estimatedDistance: surveyData.estimatedDistance
    });
  }
}

module.exports = new PricingService();
