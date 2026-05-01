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
    // console.log('\n--- DEBUG [calculatePricing] ---');
    // console.log('moveType:', moveType);
    // console.log('surveyData.suggestedStaffCount:', surveyData?.suggestedStaffCount, 'type:', typeof surveyData?.suggestedStaffCount);
    // console.log('surveyData:', JSON.stringify(surveyData, null, 2));
    // console.log('--------------------------------\n');

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
      suggestedVehicles = [],
      rentalDurationHours,
      estimatedHours,
      withDriver = true,
      suggestedStaffCount = 1,
      extraStaffCount = 0,
      distanceKm = 0,
      needsAssembling = false,
      needsPacking = false
    } = surveyData;

    let vehiclesToCalc = [...suggestedVehicles];
    if (vehiclesToCalc.length === 0 && suggestedVehicle) {
      vehiclesToCalc = [{ vehicleType: suggestedVehicle, count: 1 }];
    }

    const duration = rentalDurationHours || estimatedHours || 1;
    // For TRUCK_RENTAL, suggestedStaffCount includes the driver.
    // We only charge for helpers (extra staff).
    const totalStaff = Math.max(0, (Number(suggestedStaffCount) || 1) - 1);

    if (vehiclesToCalc.length === 0) {
      throw new AppError(`Không có thông tin xe nào được chọn`, 400);
    }

    let truckRentalFee = 0;
    vehiclesToCalc.forEach(v => {
      const vehicleConfig = priceList.vehiclePricing?.find((vp) => vp.vehicleType === v.vehicleType);
      if (!vehicleConfig) {
        throw new AppError(`Không tìm thấy thông tin giá cho xe ${v.vehicleType}`, 400);
      }
      truckRentalFee += (vehicleConfig.pricePerHour || 0) * duration * (v.count || 1);
    });

    let driverFee = 0;
    const laborConfig = priceList.laborCost || {};
    driverFee = totalStaff * (laborConfig.pricePerHourPerPerson || 0) * duration;

    // For TRUCK_RENTAL, we only charge for duration and extra labor, ignore distance fee.
    const kmFee = 0;

    // New: Additional services for Truck Rental
    const addServices = priceList.additionalServices || {};
    const assemblingFee = needsAssembling ? addServices.assemblingFee || 0 : 0;
    const packingFee = needsPacking ? addServices.packingFee || 0 : 0;

    const subtotal = truckRentalFee + driverFee + kmFee + assemblingFee + packingFee;
    const breakdown = {
      baseTransportFee: 0,
      vehicleFee: truckRentalFee + kmFee,
      laborFee: driverFee,
      itemServiceFee: 0,
      carryFee: 0,
      floorFee: 0,
      distanceFee: 0,
      assemblingFee: assemblingFee,
      packingFee: packingFee,
      insuranceFee: 0,
      managementFee: 0,
      estimatedHours: duration,
      suggestedVehicles: vehiclesToCalc,
      suggestedStaffCount: Number(suggestedStaffCount) || 1
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

  const { distanceKm = 0, suggestedStaffCount = 2, estimatedHours = 2, suggestedVehicles = [], suggestedVehicle } = surveyData;

  let vehiclesToCalc = [...suggestedVehicles];
  if (vehiclesToCalc.length === 0 && suggestedVehicle) {
    vehiclesToCalc = [{ vehicleType: suggestedVehicle, count: 1 }];
  }
  if (vehiclesToCalc.length === 0) {
    vehiclesToCalc = [{ vehicleType: '500KG', count: 1 }]; // Default if none selected
  }

  let vehicleFee = 0;
  vehiclesToCalc.forEach(v => {
    const vehicleConfig = priceList.vehiclePricing?.find(vp => vp.vehicleType === v.vehicleType)
      || priceList.vehiclePricing?.[0];
    
    if (vehicleConfig) {
      vehicleFee += (vehicleConfig.basePriceForFirstXKm || 0)
        + Math.max(0, distanceKm - (vehicleConfig.limitKm || 0)) * (vehicleConfig.pricePerNextKm || 0) * (v.count || 1);
    } else {
      vehicleFee += (500000 + distanceKm * 10000) * (v.count || 1); // Extra fallback
    }
  });

  const laborConfig = priceList.laborCost || {};
  const laborFee = (Number(suggestedStaffCount) || 2) * (laborConfig.pricePerHourPerPerson || 0) * estimatedHours;
    
  // console.log('\n--- DEBUG [laborFee] ---');
  // console.log('suggestedStaffCount:', suggestedStaffCount, 'parsed:', (Number(suggestedStaffCount) || 2));
  // console.log('estimatedHours:', estimatedHours);
  // console.log('laborConfig:', JSON.stringify(laborConfig));
  // console.log('laborFee calculated:', laborFee);
  // console.log('------------------------\n');

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
    estimatedHours,
    suggestedVehicles: vehiclesToCalc,
    suggestedStaffCount: Number(suggestedStaffCount) || 2
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
      suggestedVehicles = [],
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

    // Normalizing vehicles
    let vehiclesToCalc = [...suggestedVehicles];
    if (vehiclesToCalc.length === 0 && suggestedVehicle) {
      vehiclesToCalc = [{ vehicleType: suggestedVehicle, count: 1 }];
    }

    // 1️⃣ Ước tính giờ cơ bản
    let estimatedHours = surveyData.estimatedHours;
    if (!estimatedHours) {
      estimatedHours = 2 + distanceKm / 20 + totalActualVolume * 0.5 + floors * 0.3;
      estimatedHours = Math.max(2, Math.round(estimatedHours));
    }

    // 2️⃣ Phí Vận Chuyển / Phí Xe
    let transportTierFee = 0;
    let vehicleFee = 0;

    // 🚛 CHỌN PHÍ VẬN CHUYỂN ĐỘC QUYỀN (Nếu có mảng suggestedVehicles hoặc suggestedVehicle)
    if (vehiclesToCalc.length > 0) {
      let maxBase = 0;
      let totalKmFee = 0;

      vehiclesToCalc.forEach(v => {
        const vConfig = {
          '500KG': { base: 500000, perKm: 8000, limit: 5 },
          '1TON': { base: 700000, perKm: 12000, limit: 5 },
          '1.5TON': { base: 900000, perKm: 15000, limit: 5 },
          '2TON': { base: 1200000, perKm: 20000, limit: 5 }
        }[v.vehicleType];

        if (vConfig) {
          if (vConfig.base > maxBase) maxBase = vConfig.base;
          totalKmFee += Math.max(0, distanceKm - vConfig.limit) * vConfig.perKm * (v.count || 1);
        } else {
          // Fallback reading from priceList if not in hardcoded configs
          const dynamicConfig = priceList.vehiclePricing?.find((vp) => vp.vehicleType === v.vehicleType);
          if (dynamicConfig) {
            const dynamicBase = dynamicConfig.basePriceForFirstXKm || 0;
            if (dynamicBase > maxBase) maxBase = dynamicBase;
            totalKmFee += Math.max(0, distanceKm - (dynamicConfig.limitKm || 0)) * (dynamicConfig.pricePerNextKm || 0) * (v.count || 1);
          }
        }
      });

      vehicleFee = maxBase + totalKmFee;
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
    const parsedStaffCount = Number(suggestedStaffCount) || 0;
    const laborFee = parsedStaffCount * (laborConfig.pricePerHourPerPerson || 0) * estimatedHours;

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
      estimatedHours,
      suggestedVehicles: vehiclesToCalc,
      suggestedStaffCount: Number(suggestedStaffCount) || 0
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

    // console.log('\n--- DEBUG [formatResponse] ---');
    // console.log('original subtotal:', subtotal);
    // console.log('minimumCharge:', minimumCharge);
    // console.log('breakdown:', breakdown);

    if (finalSubtotal < minimumCharge) {
      finalSubtotal = minimumCharge;
      minApplied = true;
      // You should probably distribute the difference or put it in a specific field
      // so the Frontend doesn't have a mismatch between breakdown sum and subtotal.
      // breakdown.minimumChargeSurcharge = minimumCharge - subtotal;
      console.log('Minimum charge applied. Changing subtotal to', finalSubtotal);
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