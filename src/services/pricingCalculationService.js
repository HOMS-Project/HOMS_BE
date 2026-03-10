/**
 * PricingCalculationService - Production Ready
 *
 * Architecture choice (Option A — recommended):
 *   baseTransportFee = MANAGEMENT COST (covers company overhead, base trip fee)
 *   vehicleFee       = DISTANCE COST   (open-door fee + per-km beyond limit)
 *
 * Full formula:
 *   TOTAL = phí vận chuyển cơ bản (baseTransportFee)
 *         + phí xe (vehicleFee)
 *         + phí nhân công (laborFee)
 *         + phí dịch vụ (serviceFee)
 *         + phí phụ trội khoảng cách (distanceSurcharge)
 *         + phí phụ trội khuân vác (carryFee + floorFee)
 *         + phí bảo hiểm (insuranceFee)
 *         + phí quản lý (managementFee) (% of subtotal)
 *         - khuyến mãi (promotionDiscount) (BEFORE TAX, only if subtotal >= minOrderAmount)
 *         + thuế (tax)
 *         (minimum charge applied if total < minimumCharge)
 */

const mongoose = require('mongoose');
const PriceList = require('../models/PriceList');
const PricingData = require('../models/PricingData');
const RequestTicket = require('../models/RequestTicket');
const AppError = require('../utils/appErrors');

// Only apply the extra distance surcharge beyond this threshold to avoid double-charging
const LONG_DISTANCE_THRESHOLD_KM = 30;

class PricingCalculationService {

  /* =====================================================
     1️⃣ GET ACTIVE PRICE LIST
  ===================================================== */
  async getActivePriceList() {
    const priceList = await PriceList.findOne({ isActive: true });
    if (!priceList) {
      throw new AppError('[PricingCalculationService] Không tìm thấy bảng giá active', 404);
    }
    return priceList;
  }

  /* =====================================================
     2️⃣ MAIN CALCULATION (NO DB SAVE HERE)
  ===================================================== */
  async calculatePricing(surveyData, priceList, options = {}) {
    if (!surveyData) throw new AppError('[PricingCalculationService] Thiếu dữ liệu khảo sát', 400);
    if (!priceList) throw new AppError('[PricingCalculationService] Thiếu bảng giá', 400);

    const {
      suggestedVehicle,
      suggestedStaffCount,
      estimatedHours: surveyEstimatedHours,
      distanceKm = 0,
      carryMeter = 0,
      floors = 0,
      hasElevator = false,
      totalActualVolume = 0,
      items = [],
      needsAssembling = false,
      needsPacking = false,
      insuranceRequired = false,
      declaredValue = 0
    } = surveyData;

    // ---------------------------------------------------------------
    // 1. BASE TRANSPORT FEE (Option A: this is the MANAGEMENT / base trip fee)
    //    Uses transport tiers as a way to express tiered management cost by distance.
    //    NOT a distance-per-km fee — that's handled below by vehicleFee.
    // ---------------------------------------------------------------
    const baseTransportFee = this._calcBaseTransport(distanceKm, priceList.transportTiers || []);

    // ---------------------------------------------------------------
    // 2. VEHICLE FEE (Option A: this IS the DISTANCE COST)
    //    = basePriceForFirstXKm (open-door) + extraKm × pricePerNextKm
    //    This fully accounts for road distance. Do NOT double-charge with
    //    distanceSurcharge unless the trip is long-haul.
    // ---------------------------------------------------------------
    const estimatedHours = surveyEstimatedHours
      || this._estimateHours({ distanceKm, floors, totalActualVolume });

    const vehicleFee = this._calcVehicleFee(
      suggestedVehicle,
      distanceKm,
      priceList.vehiclePricing || []
    );

    // ---------------------------------------------------------------
    // 3. LABOR COST = staffCount × hourlyRate × estimatedHours
    // ---------------------------------------------------------------
    const laborFee = this._calcLaborCost(
      suggestedStaffCount || 2,
      estimatedHours,
      priceList.laborCost
    );

    // ---------------------------------------------------------------
    // 4. SERVICE FEE = per-item types + packing + assembling
    //    Items are matched by itemType enum — falls back to 'OTHER' rate.
    //    Items without itemType (legacy data) also fall back to 'OTHER'.
    // ---------------------------------------------------------------
    const serviceFee = this._calcServiceFees(
      items,
      { needsPacking, needsAssembling },
      priceList.itemServiceRates,
      priceList.additionalServices
    );

    // ---------------------------------------------------------------
    // 5. DISTANCE SURCHARGE — LONG HAUL ONLY (> LONG_DISTANCE_THRESHOLD_KM)
    //    vehicleFee already covers distance up to limitKm + beyond.
    //    This surcharge is ONLY for very long trips (>30km) where fuel/toll
    //    costs exceed normal vehicle pricing. Default rate is 0, admin must
    //    explicitly set distanceSurchargePerKm > 0 to activate.
    // ---------------------------------------------------------------
    const distanceSurcharge = this._calcDistanceSurcharge(distanceKm, priceList.movingSurcharge);

    // ---------------------------------------------------------------
    // 6. DIFFICULTY SURCHARGE = carry + floor
    // ---------------------------------------------------------------
    const carryFee = this._calcCarryFee(carryMeter, priceList.movingSurcharge);
    const floorFee = this._calcFloorFee(floors, hasElevator, priceList.movingSurcharge);

    // ---------------------------------------------------------------
    // 7. INSURANCE FEE — clamped between insuranceMinimum and insuranceMaximum
    // ---------------------------------------------------------------
    const insuranceFee = this._calcInsuranceFee(
      insuranceRequired, declaredValue, priceList.additionalServices
    );

    // ---------------------------------------------------------------
    // 8. SUBTOTAL (before management fee and discount)
    // ---------------------------------------------------------------
    let subtotal = baseTransportFee + vehicleFee + laborFee + serviceFee
      + distanceSurcharge + carryFee + floorFee + insuranceFee;

    // ---------------------------------------------------------------
    // 9. MANAGEMENT FEE (% of subtotal after all base fees)
    // ---------------------------------------------------------------
    const managementFeeRate = priceList.additionalServices?.managementFeeRate || 0;
    const managementFee = Math.round(subtotal * managementFeeRate);
    subtotal += managementFee;

    // ---------------------------------------------------------------
    // 10. PROMOTION DISCOUNT — applied BEFORE tax
    //     Skipped if subtotal < minOrderAmount
    // ---------------------------------------------------------------
    let discountAmount = 0;
    const minOrderAmount = priceList.promotionRules?.minOrderAmount || 0;
    const promotionEligible = subtotal >= minOrderAmount;

    if (promotionEligible) {
      if (options.discountAmount) {
        discountAmount = Math.min(options.discountAmount, subtotal);
      } else if (options.discountPercent) {
        const maxDiscount = priceList.promotionRules?.maxDiscountPercent || 100;
        const effectivePct = Math.min(options.discountPercent, maxDiscount);
        discountAmount = Math.round(subtotal * (effectivePct / 100));
      }
    }

    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

    // ---------------------------------------------------------------
    // 11. MINIMUM CHARGE CHECK (before tax)
    // ---------------------------------------------------------------
    const minimumCharge = priceList.basePrice?.minimumCharge || 0;
    let minimumChargeApplied = false;
    let finalSubtotal = subtotalAfterDiscount;
    if (finalSubtotal < minimumCharge) {
      finalSubtotal = minimumCharge;
      minimumChargeApplied = true;
      discountAmount = Math.max(0, subtotal - minimumCharge);
    }

    // ---------------------------------------------------------------
    // 12. TAX (on finalSubtotal after discount)
    // ---------------------------------------------------------------
    const taxRate = priceList.taxRate || 0.1;
    const tax = Math.round(finalSubtotal * taxRate);
    const totalPrice = Math.round((finalSubtotal + tax) / 1000) * 1000; // round to nearest 1,000đ

    return {
      breakdown: {
        baseTransportFee,  // management / trip base
        vehicleFee,        // distance cost (open-door + extra km)
        laborFee,
        serviceFee,
        distanceSurcharge, // long-haul only (>30km)
        carryFee,
        floorFee,
        insuranceFee,
        managementFee,
        estimatedHours
      },
      subtotal,
      discountAmount,
      promotionEligible,
      tax,
      totalPrice,
      minimumChargeApplied
    };
  }

  /* =====================================================
     3️⃣ SAVE PRICING DATA (AUTO VERSION)
  ===================================================== */
  async createPricingData(requestTicketId, surveyData, pricingResult, priceList, userId) {

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
      discountAmount: pricingResult.discountAmount,
      tax: pricingResult.tax,
      totalPrice: pricingResult.totalPrice,
      minimumChargeApplied: pricingResult.minimumChargeApplied,
      priceListSnapshot: {
        taxRate: priceList.taxRate,
        minimumCharge: priceList.basePrice?.minimumCharge,
        managementFeeRate: priceList.additionalServices?.managementFeeRate
      },
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
      const pricingData = await PricingData.findById(pricingDataId).session(session);

      if (!pricingData) {
        throw new AppError('PricingData không tồn tại', 404);
      }

      if (pricingData.requestTicketId.toString() !== requestTicketId) {
        throw new AppError('PricingData không thuộc RequestTicket này', 400);
      }

      const ticket = await RequestTicket.findById(requestTicketId).session(session);

      if (!ticket) {
        throw new AppError('RequestTicket không tồn tại', 404);
      }

      if (ticket.status !== 'WAITING_APPROVAL') {
        throw new AppError(`[PricingCalculationService] Không thể phê duyệt từ trạng thái ${ticket.status}`, 400);
      }

      // Revoke any previously approved pricing for this ticket
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
     🔧 PRIVATE HELPERS
  ===================================================== */

  /**
   * Base transport fee via tiered distance table.
   * Option A: this represents MANAGEMENT COST (trip overhead), NOT per-km road cost.
   * The tiers let you express: "managing a short move costs less than a long one."
   */
  _calcBaseTransport(distanceKm, tiers) {
    if (!tiers || tiers.length === 0) return 0;

    const sorted = [...tiers].sort((a, b) => a.fromKm - b.fromKm);

    for (let i = 0; i < sorted.length; i++) {
      const tier = sorted[i];
      const isLast = i === sorted.length - 1;

      if (isLast || distanceKm < (tier.toKm ?? Infinity)) {
        const extra = isLast && tier.toKm == null
          ? Math.max(0, distanceKm - tier.fromKm) * (tier.pricePerKmBeyond || 0)
          : 0;
        return tier.flatFee + extra;
      }
    }

    return 0;
  }

  /**
   * Vehicle fee = DISTANCE COST (Option A).
   * = basePriceForFirstXKm (open-door) + (distanceKm - limitKm) × pricePerNextKm
   * This is the primary distance pricing; distanceSurcharge should NOT be added
   * unless distanceKm > LONG_DISTANCE_THRESHOLD_KM.
   */
  _calcVehicleFee(vehicleType, distanceKm, vehiclePricing) {
    const config = vehiclePricing?.find(v => v.vehicleType === vehicleType);
    if (!config) return 0; // graceful: no config for this vehicle type

    let fee = config.basePriceForFirstXKm || 0;
    if (distanceKm > (config.limitKm || 0)) {
      fee += (distanceKm - config.limitKm) * (config.pricePerNextKm || 0);
    }

    return Math.round(fee);
  }

  /**
   * Labor cost = staffCount × pricePerHourPerPerson × estimatedHours
   */
  _calcLaborCost(staffCount, estimatedHours, laborCost) {
    if (!laborCost) return 0;
    const hourlyRate = laborCost.pricePerHourPerPerson || 0;
    return Math.round(staffCount * hourlyRate * estimatedHours);
  }

  /**
   * Service fees:
   *   - Per-item type fee (TV, FRIDGE, BED…)
   *     Items without itemType default to 'OTHER' — safe for legacy data.
   *   - Packing fee (if needsPacking)
   *   - Assembling fee (if needsAssembling)
   */
  _calcServiceFees(items, needs, itemServiceRates, additionalServices) {
    let total = 0;

    if (items && itemServiceRates) {
      for (const item of items) {
        // Use itemType if present; fall back to 'OTHER' for legacy items without it
        const type = item.itemType || 'OTHER';
        total += (itemServiceRates[type] ?? itemServiceRates.OTHER) || 0;
      }
    }

    if (needs.needsPacking) {
      total += additionalServices?.packingFee || 0;
      total += additionalServices?.packingMaterial || 0;
    }

    if (needs.needsAssembling) {
      total += additionalServices?.assemblingFee || 0;
    }

    return Math.round(total);
  }

  /**
   * Distance surcharge — LONG HAUL ONLY.
   * Only applies when distanceKm > LONG_DISTANCE_THRESHOLD_KM (default 30km).
   * vehicleFee already prices the full distance via basePriceForFirstXKm + pricePerNextKm.
   * This surcharge compensates for extra fuel/toll costs on very long trips.
   * Admin must set distanceSurchargePerKm > 0 to activate.
   */
  _calcDistanceSurcharge(distanceKm, movingSurcharge) {
    const rate = movingSurcharge?.distanceSurchargePerKm || 0;
    if (!rate || distanceKm <= LONG_DISTANCE_THRESHOLD_KM) return 0;
    // Only surcharge the km BEYOND the threshold to avoid double-charging
    return Math.round((distanceKm - LONG_DISTANCE_THRESHOLD_KM) * rate);
  }

  /**
   * Carry-distance surcharge (beyond freeCarryDistance)
   */
  _calcCarryFee(carryMeter, movingSurcharge) {
    const freeDistance = Number(movingSurcharge?.freeCarryDistance) || 0;
    const pricePerMeter = Number(movingSurcharge?.pricePerExtraMeter) || 0;
    if (carryMeter <= freeDistance) return 0;
    return Math.round((carryMeter - freeDistance) * pricePerMeter);
  }

  /**
   * Floor surcharge (stair or elevator, per floor)
   */
  _calcFloorFee(floors, hasElevator, movingSurcharge) {
    if (!floors || floors <= 0) return 0;
    const rate = hasElevator
      ? (movingSurcharge?.elevatorSurcharge || 0)
      : (movingSurcharge?.stairSurchargePerFloor || 0);
    return Math.round(floors * rate);
  }

  /**
   * Insurance fee = declaredValue × insuranceRate
   * Clamped: insuranceMinimum ≤ fee ≤ insuranceMaximum
   * Example: 50M × 1% = 500k → clamped to [50k, 5M]
   */
  _calcInsuranceFee(insuranceRequired, declaredValue, additionalServices) {
    if (!insuranceRequired || declaredValue <= 0) return 0;

    const rate = additionalServices?.insuranceRate || 0.01;
    const minFee = additionalServices?.insuranceMinimum || 0;
    const maxFee = additionalServices?.insuranceMaximum || Infinity;

    const rawFee = Math.round(declaredValue * rate);
    return Math.min(maxFee, Math.max(minFee, rawFee));
  }

  /**
   * Estimate hours heuristically when not provided by surveyor.
   * Used ONLY as a fallback; surveyor's estimatedHours takes priority.
   */
  _estimateHours({ distanceKm = 0, floors = 0, totalActualVolume = 0 }) {
    let hours = 2;
    hours += distanceKm * 0.1;
    hours += floors * 0.5;
    hours += totalActualVolume * 0.3;
    return Math.max(2, Math.ceil(hours));
  }
}

module.exports = new PricingCalculationService();