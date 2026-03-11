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
      suggestedStaffCount,
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

    // ================= VEHICLE =================
    const vehicleConfig = priceList.vehiclePricing?.find(
      v => v.vehicleType === suggestedVehicle
    );

    if (!vehicleConfig) {
      throw new AppError(`Không tìm thấy cấu hình xe ${suggestedVehicle}`, 400);
    }

    // Ước tính giờ
    let estimatedHours = 2 + (distanceKm / 20) + (totalActualVolume * 0.5) + (floors * 0.3);
    estimatedHours = Math.max(2, Math.round(estimatedHours));

    const vehicleFee = vehicleConfig.pricePerHour * estimatedHours;

    // ================= STAFF =================
    let staffConfig = priceList.staffPricing?.find(
      s => s.staffCount === suggestedStaffCount
    );

    // Fallback if no exact match is found, try to calculate based on an average or use a default
    if (!staffConfig) {
       console.warn(`[Pricing] Không tìm thấy cấu hình staffPricing chính xác cho ${suggestedStaffCount} người. Sẽ sử dụng mặc định.`);
       // If there's any staff pricing, we can use it to derive a per-person cost.
       // Else use a hardcoded fallback of 200k/person.
       let defaultPricePerPerson = 200000; 
       
       if (priceList.staffPricing && priceList.staffPricing.length > 0) {
           defaultPricePerPerson = priceList.staffPricing[0].pricePerPerson || 200000;
       }

       staffConfig = {
           staffCount: suggestedStaffCount,
           pricePerPerson: defaultPricePerPerson,
           pricePerHour: Math.round(defaultPricePerPerson / 4)
       };
    }

    const laborFee = suggestedStaffCount * (staffConfig.pricePerPerson || 0);

    // ================= DISTANCE =================
    const distanceFee = distanceKm > 0 
      ? distanceKm * (priceList.movingSurcharge?.distanceSurchargePerKm || 0)
      : 0;

    // ================= CARRY/MOVE =================
    const freeCarry = priceList.movingSurcharge?.freeCarryDistance || 0;
    const carryFee = carryMeter > freeCarry
      ? (carryMeter - freeCarry) * (priceList.movingSurcharge?.pricePerExtraMeter || 0)
      : 0;

    // ================= FLOOR =================
    const floorSurcharge = hasElevator
      ? priceList.movingSurcharge?.elevatorSurcharge
      : priceList.movingSurcharge?.stairSurchargePerFloor;
    const floorFee = floors * (floorSurcharge || 0);

    // ================= SERVICES =================
    const assemblingFee = needsAssembling 
      ? (priceList.additionalServices?.assemblingFee || 0)
      : 0;

    const packingFee = needsPacking 
      ? (priceList.additionalServices?.packingFee || 0)
      : 0;

    const insuranceFee = insuranceRequired && declaredValue > 0
      ? declaredValue * (priceList.additionalServices?.insuranceRate || 0)
      : 0;

    // ================= BASE TRANSPORT FEE =================
    const baseTransportFee = vehicleConfig.basePriceForFirstXKm || 0;

    // ================= SUBTOTAL =================
    let subtotal = vehicleFee + laborFee + distanceFee + carryFee + floorFee + assemblingFee + packingFee + insuranceFee + baseTransportFee;

    // ================= MANAGEMENT FEE =================
    const managementFeeRate = priceList.additionalServices?.managementFeeRate || 0;
    const managementFee = Math.round(subtotal * managementFeeRate);
    subtotal += managementFee;

    // ================= MINIMUM CHARGE =================
    const minimumCharge = priceList.basePrice?.minimumCharge || 0;
    let minimumChargeApplied = false;
    if (subtotal < minimumCharge) {
      subtotal = minimumCharge;
      minimumChargeApplied = true;
    }

    // ================= TAX =================
    const taxRate = priceList.taxRate || 0.1;
    const tax = Math.round(subtotal * taxRate);
    let totalPrice = subtotal + tax;

    // LÀM TRÒN PHẦN NGHÌN (Round to nearest 1,000)
    totalPrice = Math.round(totalPrice / 1000) * 1000;

    return {
      breakdown: {
        baseTransportFee,
        vehicleFee,
        laborFee,
        distanceFee,
        carryFee,
        floorFee,
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