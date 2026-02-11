/**
 * Controller xử lý Invoice
 * Tích hợp các services: Survey, Pricing, RouteValidation, VehicleDispatch
 */

const Invoice = require('../models/Invoice');
const SurveyService = require('../services/surveyService');
const PricingService = require('../services/pricingService');
const RouteValidationService = require('../services/routeValidationService');
const VehicleDispatchService = require('../services/vehicleDispatchService');
const AppError = require('../utils/appErrors');

/**
 * 1. TẠO INVOICE TỪ REQUEST TICKET
 * Status: DRAFT
 */
exports.createInvoice = async (req, res) => {
  try {
    const { requestTicketId, customerId, pickup, delivery, moveType } = req.body;

    const invoice = new Invoice({
      requestTicketId,
      customerId,
      pickup,
      delivery,
      moveType,
      status: 'DRAFT'
    });

    await invoice.save();

    res.status(201).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 2. KHẢO SÁT
 * Tạo survey & cập nhật weight/volume thực tế
 */
exports.scheduleSurvey = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { surveyType, scheduledDate } = req.body;

    const survey = await SurveyService.createSurvey(invoiceId, {
      surveyType,
      scheduledDate,
      surveyorId: req.user._id
    });

    // Cập nhật invoice status
    await Invoice.findByIdAndUpdate(invoiceId, {
      status: 'WAITING_SURVEY'
    });

    res.status(201).json({
      success: true,
      data: survey
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 3. HOÀN TẤT KHẢO SÁT
 * Tính toán weight/volume thực tế
 */
exports.completeSurvey = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { surveyItems, accessibility, notes } = req.body;

    const survey = await SurveyService.completeSurvey(invoiceId, {
      items: surveyItems,
      accessibility,
      notes
    });

    // Cập nhật invoice status
    await Invoice.findByIdAndUpdate(invoiceId, {
      status: 'SURVEYED'
    });

    res.status(200).json({
      success: true,
      data: survey
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 4. TÍNH GIÁ
 * Tính basePrice + services + staff + vehicle + surcharge + tax
 */
exports.calculatePrice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const {
      estimatedDistance,
      totalWeight,
      totalVolume,
      services,
      staffCount,
      vehicleType,
      estimatedDuration,
      surcharge,
      promotionId,
      discountCode
    } = req.body;

    const pricing = await PricingService.calculatePrice(invoiceId, {
      estimatedDistance,
      totalWeight,
      totalVolume,
      services,
      staffCount,
      vehicleType,
      estimatedDuration,
      surcharge,
      promotionId,
      discountCode,
      calculatedBy: req.user._id
    });

    // Cập nhật invoice status
    await Invoice.findByIdAndUpdate(invoiceId, {
      status: 'PRICE_QUOTED'
    });

    res.status(200).json({
      success: true,
      data: pricing
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 5. KIỂM TRA TUYẾN ĐƯỜNG
 */
exports.validateRoute = async (req, res) => {
  try {
    const { routeId } = req.params;
    const {
      vehicleType,
      totalWeight,
      totalVolume,
      pickupTime,
      deliveryTime,
      pickupAddress,
      deliveryAddress
    } = req.body;

    const validation = await RouteValidationService.validateRoute(routeId, {
      vehicleType,
      totalWeight,
      totalVolume,
      pickupTime: new Date(pickupTime),
      deliveryTime: new Date(deliveryTime),
      pickupAddress,
      deliveryAddress
    });

    res.status(200).json({
      success: true,
      data: validation
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 6. TÌM TUYẾN ĐƯỜNG TỐI ƯU
 */
exports.findOptimalRoute = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await Invoice.findById(invoiceId);

    const routes = await RouteValidationService.findOptimalRoute({
      vehicleType: req.body.vehicleType,
      totalWeight: req.body.totalWeight,
      totalVolume: req.body.totalVolume,
      pickupTime: new Date(invoice.scheduledTime)
    });

    res.status(200).json({
      success: true,
      data: routes
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 7. ĐIỀU PHỐI XE & NHÂN SỰ
 */
exports.dispatchVehicles = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const {
      totalWeight,
      totalVolume,
      driverIds,
      staffIds,
      estimatedDuration
    } = req.body;

    const assignment = await VehicleDispatchService.createDispatchAssignment(invoiceId, {
      totalWeight,
      totalVolume,
      driverIds,
      staffIds,
      estimatedDuration
    });

    // Cập nhật invoice status
    await Invoice.findByIdAndUpdate(invoiceId, {
      status: 'ASSIGNED'
    });

    res.status(201).json({
      success: true,
      data: assignment
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 8. XÁC NHẬN DISPATCH
 */
exports.confirmDispatch = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await Invoice.findById(invoiceId);

    const assignment = await VehicleDispatchService.confirmDispatchAssignment(
      invoice.dispatchAssignmentId
    );

    res.status(200).json({
      success: true,
      data: assignment
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 9. LẤY THÔNG TIN INVOICE
 */
exports.getInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findById(invoiceId)
      .populate('requestTicketId')
      .populate('customerId')
      .populate('pricingDataId')
      .populate('surveyDataId')
      .populate('dispatchAssignmentId')
      .populate('routeId');

    if (!invoice) {
      throw new AppError('Invoice not found', 404);
    }

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * 10. CẬP NHẬT TRẠNG THÁI INVOICE
 */
exports.updateInvoiceStatus = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { status, notes } = req.body;

    const invoice = await Invoice.findByIdAndUpdate(
      invoiceId,
      { status, notes },
      { new: true }
    );

    // Thêm vào timeline
    invoice.timeline.push({
      status,
      updatedBy: req.user._id,
      updatedAt: new Date(),
      notes
    });

    await invoice.save();

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
