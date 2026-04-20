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
    const priceList = await PriceList.findOne({ isActive: true });
    if (!priceList) {
      throw new AppError('Không tìm thấy bảng giá active', 404);
    }
    return priceList;
  }

  /* =====================================================
     2️⃣ MAIN CALCULATION (NO DB SAVE HERE)
  ===================================================== */
  async calculatePricing(surveyData, priceList, moveType) {
    if (!surveyData) {
      throw new AppError('Thiếu dữ liệu khảo sát', 400);
    }

    // CHIA NHÁNH DỰA TRÊN MOVE_TYPE
    switch (moveType) {
      case 'TRUCK_RENTAL':
        return this._calcTruckRental(surveyData, priceList);
      case 'SPECIFIC_ITEMS':
        return this._calcSpecificItems(surveyData, priceList);
      case 'FULL_HOUSE':
      default:
        return this._calcFullHouse(surveyData, priceList);
    }
  }

  /* -----------------------------------------------------
     A. TÍNH GIÁ THUÊ XE TẢI (TRUCK RENTAL)
  ----------------------------------------------------- */
  _calcTruckRental(surveyData, priceList) {
    const {
      suggestedVehicle,
      rentalDurationHours,
      estimatedHours,
      withDriver,
      suggestedStaffCount = 1,
      distanceKm = 0
    } = surveyData;

    const duration = rentalDurationHours || estimatedHours || 1;
    const driverIncluded = withDriver !== null ? withDriver : suggestedStaffCount > 1;

    const vehicleConfig = priceList.vehiclePricing?.find(
      (v) => v.vehicleType === suggestedVehicle
    );
    if (!vehicleConfig) {
      throw new AppError(`Không tìm thấy thông tin giá cho xe ${suggestedVehicle}`, 400);
    }

    const truckRentalFee = (vehicleConfig.pricePerHour || 0) * duration;

    let driverFee = 0;
    if (driverIncluded) {
      const laborConfig = priceList.laborCost || {};
      driverFee =
        (laborConfig.pricePerHourPerPerson || 0) * duration +
        (laborConfig.basePricePerPerson || 0);
    }

    let kmFee = 0;
    if (distanceKm > 0 && vehicleConfig.limitKm) {
      kmFee =
        (vehicleConfig.basePriceForFirstXKm || 0) +
        Math.max(0, distanceKm - vehicleConfig.limitKm) * (vehicleConfig.pricePerNextKm || 0);
    }

    const subtotal = truckRentalFee + driverFee + kmFee;
    const breakdown = {
      baseTransportFee: 0,
      vehicleFee: truckRentalFee + kmFee,
      laborFee: driverFee,
      itemServiceFee: 0,
      carryFee: 0,
      floorFee: 0,
      distanceFee: 0,
      assemblingFee: 0,
      packingFee: 0,
      insuranceFee: 0,
      managementFee: 0,
      estimatedHours: duration
    };

    const taxRate = priceList.taxRate !== undefined ? priceList.taxRate : 0.1;
    const result = this._formatResponse(subtotal, breakdown, priceList, taxRate);
    
    // Thêm các trường đặc thù cho Thuê xe
    result.isFinalized = false;
    result.depositAmount = Math.round(result.totalPrice * 0.3); // Cọc 30%
    return result;
  }

  /* -----------------------------------------------------
     B. TÍNH GIÁ CHUYỂN ĐỒ LẺ (SPECIFIC ITEMS)
  ----------------------------------------------------- */
  _calcSpecificItems(surveyData, priceList) {
    const { distanceKm = 0, suggestedStaffCount = 2 } = surveyData;
    
    const vehicleFee = 500000 + distanceKm * 10000;
    const laborFee = suggestedStaffCount * 300000;
    const subtotal = vehicleFee + laborFee;

    const breakdown = {
      baseTransportFee: 0,
      vehicleFee,
      laborFee,
      itemServiceFee: 0,
      carryFee: 0,
      floorFee: 0,
      distanceFee: 0,
      assemblingFee: 0,
      packingFee: 0,
      insuranceFee: 0,
      managementFee: 0,
      estimatedHours: 1
    };

    const taxRate = priceList.taxRate !== undefined ? priceList.taxRate : 0.1;
    return this._formatResponse(subtotal, breakdown, priceList, taxRate);
  }

  /* -----------------------------------------------------
     C. TÍNH GIÁ CHUYỂN NHÀ TRỌN GÓI (FULL HOUSE)
  ----------------------------------------------------- */
  _calcFullHouse(surveyData, priceList) {
    const {
      suggestedVehicle,
      suggestedStaffCount = 0,
      distanceKm = 0,
      carryMeter = 0,
      floors = 0,
      hasElevator = false,
      totalActualVolume = 0,
      needsAssembling = false,
      needsPacking = false,
      insuranceRequired = false,
      declaredValue = 0
    } = surveyData;

    // 1️⃣ Ước tính giờ cơ bản
    let estimatedHours = surveyData.estimatedHours;
    if (!estimatedHours) {
      estimatedHours = 2 + distanceKm / 20 + totalActualVolume * 0.5 + floors * 0.3;
      estimatedHours = Math.max(2, Math.round(estimatedHours));
    }

    // 2️⃣ Phí Vận Chuyển / Phí Xe
    let transportTierFee = 0;
    let vehicleFee = 0;

    const vehicleConfig = priceList.vehiclePricing?.find((v) => v.vehicleType === suggestedVehicle);
    
    if (vehicleConfig) {
      const kmFee =
        (vehicleConfig.basePriceForFirstXKm || 0) +
        Math.max(0, distanceKm - (vehicleConfig.limitKm || 0)) * (vehicleConfig.pricePerNextKm || 0);
      const timeFee = estimatedHours * (vehicleConfig.pricePerHour || 0);
      vehicleFee = kmFee + timeFee;
    }

    // 🚛 CHỌN PHÍ VẬN CHUYỂN ĐỘC QUYỀN (Ghi đè nếu có suggestedVehicle)
    if (suggestedVehicle) {
      const vConfig = {
        '500KG': { base: 500000, perKm: 8000, limit: 5 },
        '1TON': { base: 700000, perKm: 12000, limit: 5 },
        '1.5TON': { base: 900000, perKm: 15000, limit: 5 },
        '2TON': { base: 1200000, perKm: 20000, limit: 5 }
      }[suggestedVehicle];

      if (vConfig) {
        vehicleFee = vConfig.base + Math.max(0, distanceKm - vConfig.limit) * vConfig.perKm;
      }
      transportTierFee = 0;
    } else {
      if (distanceKm <= 5) transportTierFee = 500000;
      else if (distanceKm <= 10) transportTierFee = 700000;
      else if (distanceKm <= 20) transportTierFee = 1000000;
      else transportTierFee = 1000000 + (distanceKm - 20) * 20000;
      vehicleFee = 0;
    }

    // 3️⃣ Phí Nhân Công
    const laborConfig = priceList.laborCost || {};
    const laborFee =
      suggestedStaffCount *
      ((laborConfig.basePricePerPerson || 0) +
        (laborConfig.pricePerHourPerPerson || 0) * estimatedHours);

    // 4️⃣ Phụ phí di chuyển
    const movingSurcharge = priceList.movingSurcharge || {};
    const freeCarry = movingSurcharge.freeCarryDistance || 0;
    const carryFee =
      carryMeter > freeCarry ? (carryMeter - freeCarry) * (movingSurcharge.pricePerExtraMeter || 0) : 0;
    
    const floorSurchargeAt = hasElevator
      ? movingSurcharge.elevatorSurcharge
      : movingSurcharge.stairSurchargePerFloor;
    const floorFee = floors * (floorSurchargeAt || 0);

    // 5️⃣ Phụ phí quãng đường xa, giờ cao điểm
    let finalDistanceFee = 0;
    if (distanceKm > 30) {
      const baseDistanceFee = (distanceKm - 30) * 2000;
      let multiplier = 1;
      const moveDateStr = surveyData.requestTicketId?.scheduledTime || surveyData.scheduledTime;
      
      if (moveDateStr) {
        const moveDate = new Date(moveDateStr);
        const day = moveDate.getDay();
        const decimalHour = moveDate.getHours() + moveDate.getMinutes() / 60;

        if (day === 0 || day === 6) multiplier *= 1.15;
        if ((decimalHour >= 7 && decimalHour <= 9) || (decimalHour >= 16.5 && decimalHour <= 18.5)) {
          multiplier *= 1.2;
        }
      }
      finalDistanceFee = Math.round(baseDistanceFee * multiplier);
    }

    // 6️⃣ Dịch vụ bổ sung
    const addServices = priceList.additionalServices || {};
    const assemblingFee = needsAssembling ? addServices.assemblingFee || 0 : 0;
    const packingFee = needsPacking ? addServices.packingFee || 0 : 0;
    const insuranceFee = insuranceRequired && declaredValue > 0
        ? declaredValue * (addServices.insuranceRate || 0)
        : 0;

    // 7️⃣ TỔNG CHI PHÍ & Management Fee
    let subtotal =
      transportTierFee +
      vehicleFee +
      laborFee +
      carryFee +
      floorFee +
      finalDistanceFee +
      assemblingFee +
      packingFee +
      insuranceFee;

    const managementFeeRate = addServices.managementFeeRate || 0;
    const managementFee = Math.round(subtotal * managementFeeRate);
    subtotal += managementFee;

    // Xây dựng Breakdown
    const breakdown = {
      baseTransportFee: transportTierFee,
      vehicleFee,
      laborFee,
      itemServiceFee: 0,
      carryFee,
      floorFee,
      distanceFee: finalDistanceFee,
      assemblingFee,
      packingFee,
      insuranceFee,
      managementFee,
      estimatedHours
    };

    const taxRate = priceList.taxRate !== undefined ? priceList.taxRate : 0.1;
    return this._formatResponse(subtotal, breakdown, priceList, taxRate);
  }

  /* -----------------------------------------------------
     D. FORMAT RESPONSE CHUNG
  ----------------------------------------------------- */
  _formatResponse(subtotal, breakdown, priceList, taxRate = 0.1) {
    let finalSubtotal = subtotal;
    const minimumCharge = priceList?.basePrice?.minimumCharge || 0;
    let minApplied = false;

    if (finalSubtotal < minimumCharge) {
      finalSubtotal = minimumCharge;
      minApplied = true;
    }

    const tax = Math.round(finalSubtotal * taxRate);
    const totalPrice = Math.round((finalSubtotal + tax) / 1000) * 1000; // Làm tròn tới hàng nghìn

    return {
      breakdown,
      subtotal: finalSubtotal,
      tax,
      totalPrice,
      minimumChargeApplied: minApplied
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

    const newVersion = latest.length > 0 ? latest[0].version + 1 : 1;

    const pricingData = new PricingData({
      requestTicketId,
      surveyDataId: surveyData._id,
      priceListId: priceList._id,
      breakdown: pricingResult.breakdown,
      subtotal: pricingResult.subtotal,
      tax: pricingResult.tax,
      totalPrice: pricingResult.totalPrice,
      minimumChargeApplied: pricingResult.minimumChargeApplied,
      calculatedBy: userId,
      version: newVersion,
      isApproved: false,
      dynamicAdjustment: pricingResult.dynamicAdjustment
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
      const pricingData = await PricingData.findById(pricingDataId).session(session);
      if (!pricingData) throw new AppError('PricingData không tồn tại', 404);

      if (pricingData.requestTicketId.toString() !== requestTicketId) {
        throw new AppError('PricingData không thuộc RequestTicket này', 400);
      }

      const ticket = await RequestTicket.findById(requestTicketId).session(session);
      if (!ticket) throw new AppError('RequestTicket không tồn tại', 404);

      if (ticket.status !== 'WAITING_APPROVAL') {
        throw new AppError(`Không thể phê duyệt từ trạng thái ${ticket.status}`, 400);
      }

      // Vô hiệu hóa các bản cũ
      await PricingData.updateMany({ requestTicketId }, { isApproved: false }, { session });

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

      const TicketStateMachine = require('./TicketStateMachine');
      await TicketStateMachine.transition(ticket, 'QUOTED', { session });

      await session.commitTransaction();
      session.endSession();

      return { pricingData, ticket };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }
}

module.exports = new PricingCalculationService();