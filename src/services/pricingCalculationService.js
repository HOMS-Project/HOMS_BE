/**
 * PricingCalculationService - Production Ready
 */

const mongoose = require('mongoose');
const PriceList = require('../models/PriceList');
const PricingData = require('../models/PricingData');
const RequestTicket = require('../models/RequestTicket');
const AppError = require('../utils/appErrors');

class PricingCalculationService {

  /* =====================================================
     1️⃣ GET ACTIVE PRICE LIST
  ===================================================== */
  async getActivePriceList() {
    const priceList = await PriceList.findOne({
      isActive: true
    });

    if (!priceList) {
      throw new AppError('Không tìm thấy bảng giá active', 404);
    }

    return priceList;
  }

  /* =====================================================
     2️⃣ MAIN CALCULATION (NO DB SAVE HERE)
  ===================================================== */
  async calculatePricing(surveyData, priceList) {
    if (!surveyData) {
      throw new AppError('Thiếu dữ liệu khảo sát', 400);
    }

    const {
      suggestedVehicle,
      suggestedStaffCount = 0,
      distanceKm = 0,
      carryMeter = 0,
      floors = 0,
      hasElevator = false,
      totalActualVolume = 0,
      totalActualWeight = 0,
      needsAssembling = false,
      needsPacking = false,
      insuranceRequired = false,
      declaredValue = 0,
      items = []
    } = surveyData;

    // 1️⃣ Ước tính giờ cơ bản (dùng cho labo và xe)
    let estimatedHours = 2 + (distanceKm / 20) + (totalActualVolume * 0.5) + (floors * 0.3);
    estimatedHours = Math.max(2, Math.round(estimatedHours));

    // 2️⃣ PHÍ VẬN CHUYỂN (Transport Tiers)
    let transportTierFee = 0;
    const tier = priceList.transportTiers?.find(t =>
      distanceKm >= t.fromKm && (t.toKm === null || distanceKm < t.toKm)
    );
    if (tier) {
      transportTierFee = tier.flatFee;
      if (tier.pricePerKmBeyond > 0 && distanceKm > tier.fromKm) {
        transportTierFee += (distanceKm - tier.fromKm) * tier.pricePerKmBeyond;
      }
    }

    // 3️⃣ PHÍ XE (Vehicle Pricing)
    const vehicleConfig = priceList.vehiclePricing?.find(
      v => v.vehicleType === suggestedVehicle
    );
    let vehicleFee = 0;
    if (vehicleConfig) {
      // Phí theo KM
      const kmFee = vehicleConfig.basePriceForFirstXKm +
        (Math.max(0, distanceKm - vehicleConfig.limitKm) * vehicleConfig.pricePerNextKm);

      // Phí theo thời gian
      const timeFee = estimatedHours * (vehicleConfig.pricePerHour || 0);

      vehicleFee = kmFee + timeFee;
    }

    // 4️⃣ PHÍ NHÂN CÔNG (Labor Cost)
    const laborConfig = priceList.laborCost || {};
    const laborFee = suggestedStaffCount * (
      (laborConfig.basePricePerPerson || 0) +
      ((laborConfig.pricePerHourPerPerson || 0) * estimatedHours)
    );

    // 5️⃣ PHÍ DỊCH VỤ THEO MÓN ĐỒ (Item Service Rates)
    let itemServiceFee = 0;
    const itemRates = priceList.itemServiceRates || new Map();
    items.forEach(item => {
      const itemName = item.name?.toUpperCase();
      let rate = 0;

      if (itemRates instanceof Map) {
        rate = itemRates.get(itemName) || itemRates.get('OTHER');
      } else {
        rate = itemRates[itemName] || itemRates['OTHER'];
      }

      itemServiceFee += Number(rate) || 0;
    });

    // 6️⃣ PHỤ PHÍ DI CHUYỂN (Moving Surcharges)
    const movingSurcharge = priceList.movingSurcharge || {};
    const freeCarry = movingSurcharge.freeCarryDistance || 0;
    const carryFee = carryMeter > freeCarry
      ? (carryMeter - freeCarry) * (movingSurcharge.pricePerExtraMeter || 0)
      : 0;

    const floorSurchargeAt = hasElevator
      ? movingSurcharge.elevatorSurcharge
      : movingSurcharge.stairSurchargePerFloor;
    const floorFee = floors * (floorSurchargeAt || 0);

    // 7️⃣ QUY TẮC TÍNH PHÍ BỔ SUNG (Pricing Rules)
    let rulesSurcharge = 0;
    const rules = priceList.pricingRules || {};

    if (rules.distanceSurcharge?.enabled) {
      rulesSurcharge += Math.max(0, distanceKm - (rules.distanceSurcharge.freeKm || 0)) * (rules.distanceSurcharge.pricePerKm || 0);
    }
    if (rules.volumeSurcharge?.enabled) {
      rulesSurcharge += Math.max(0, totalActualVolume - (rules.volumeSurcharge.freeM3 || 0)) * (rules.volumeSurcharge.pricePerM3 || 0);
    }
    if (rules.weightSurcharge?.enabled) {
      rulesSurcharge += Math.max(0, totalActualWeight - (rules.weightSurcharge.freeKg || 0)) * (rules.weightSurcharge.pricePerKg || 0);
    }

    // 8️⃣ DỊCH VỤ BỔ SUNG (Additional Services)
    const addServices = priceList.additionalServices || {};
    const assemblingFee = needsAssembling ? (addServices.assemblingFee || 0) : 0;
    const packingFee = needsPacking ? (addServices.packingFee || 0) : 0;
    const insuranceFee = (insuranceRequired && declaredValue > 0)
      ? declaredValue * (addServices.insuranceRate || 0)
      : 0;

    // 9️⃣ TỔNG CHI PHÍ (Subtotal & Tax)
    let subtotal = transportTierFee + vehicleFee + laborFee + itemServiceFee + carryFee + floorFee + rulesSurcharge + assemblingFee + packingFee + insuranceFee;

    const managementFeeRate = addServices.managementFeeRate || 0;
    const managementFee = Math.round(subtotal * managementFeeRate);
    subtotal += managementFee;

    const minimumCharge = priceList.basePrice?.minimumCharge || 0;
    let minimumChargeApplied = false;
    if (subtotal < minimumCharge) {
      subtotal = minimumCharge;
      minimumChargeApplied = true;
    }

    const taxRate = priceList.taxRate || 0.1;
    const tax = Math.round(subtotal * taxRate);
    let totalPrice = subtotal + tax;

    // Làm tròn đến hàng nghìn
    totalPrice = Math.round(totalPrice / 1000) * 1000;

    return {
      breakdown: {
        baseTransportFee: transportTierFee,
        vehicleFee,
        laborFee,
        itemServiceFee,
        carryFee,
        floorFee,
        distanceFee: rulesSurcharge,
        assemblingFee,
        packingFee,
        insuranceFee,
        managementFee,
        estimatedHours
      },
      subtotal,
      tax,
      totalPrice,
      minimumChargeApplied
    };
  }

  /* =====================================================
     3️⃣ SAVE PRICING DATA (AUTO VERSION)
  ===================================================== */
  async createPricingData(requestTicketId, surveyData, pricingResult, userId) {

    const priceList = await this.getActivePriceList();

    const latest = await PricingData.find({ requestTicketId })
      .sort({ version: -1 })
      .limit(1);

    const newVersion =
      latest.length > 0 ? latest[0].version + 1 : 1;

    const pricingData = new PricingData({
      requestTicketId,
      surveyDataId: surveyData._id,
      priceListId: priceList._id,
      breakdown: pricingResult.breakdown,
      subtotal: pricingResult.subtotal,
      tax: pricingResult.tax,
      totalPrice: pricingResult.totalPrice,
      minimumChargeApplied:
        pricingResult.minimumChargeApplied,
      calculatedBy: userId,
      version: newVersion,
      isApproved: false
    });

    await pricingData.save();
    return pricingData;
  }

  /* =====================================================
     4️⃣ APPROVE PRICING (TRANSACTION SAFE)
  ===================================================== */
  async approvePricing(requestTicketId, pricingDataId) {

    const session = await mongoose.startSession();
    session.startTransaction();

    try {

      const pricingData =
        await PricingData.findById(pricingDataId)
          .session(session);

      if (!pricingData) {
        throw new AppError('PricingData không tồn tại', 404);
      }

      if (
        pricingData.requestTicketId.toString() !==
        requestTicketId
      ) {
        throw new AppError(
          'PricingData không thuộc RequestTicket này',
          400
        );
      }

      const ticket =
        await RequestTicket.findById(requestTicketId)
          .session(session);

      if (!ticket) {
        throw new AppError('RequestTicket không tồn tại', 404);
      }

      if (ticket.status !== 'WAITING_APPROVAL') {
        throw new AppError(
          `Không thể phê duyệt từ trạng thái ${ticket.status}`,
          400
        );
      }

      await PricingData.updateMany(
        { requestTicketId },
        { isApproved: false },
        { session }
      );

      pricingData.isApproved = true;
      await pricingData.save({ session });

      ticket.pricing = {
        pricingDataId: pricingData._id,
        subtotal: pricingData.subtotal,
        tax: pricingData.tax,
        totalPrice: pricingData.totalPrice,
        version: pricingData.version,
        quotedAt: new Date(),
        isFinalized: false
      };

      ticket.status = 'QUOTED';

      await ticket.save({ session });

      await session.commitTransaction();
      session.endSession();

      return { pricingData, ticket };

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /* =====================================================
     🔧 HELPER FUNCTIONS
  ===================================================== */

  _calculateCarryFee(carryMeter, movingSurcharge) {
    const freeDistance =
      Number(movingSurcharge?.freeCarryDistance) || 0;

    const pricePerMeter =
      Number(movingSurcharge?.pricePerExtraMeter) || 0;

    if (carryMeter <= freeDistance) {
      return 0;
    }

    const extraMeter = carryMeter - freeDistance;
    return extraMeter * pricePerMeter;
  }

  _estimateHours({ distanceKm, floors, suggestedStaffCount }) {
    let hours = 2;

    hours += distanceKm * 0.1;
    hours += floors * 0.5;

    if (suggestedStaffCount <= 2) {
      hours += 1;
    }

    return Math.ceil(hours);
  }
}

module.exports = new PricingCalculationService();