const DispatchAssignment = require('../../models/DispatchAssignment');
const Invoice = require('../../models/Invoice');
const RequestTicket = require('../../models/RequestTicket');
const SurveyData = require('../../models/SurveyData');
const DispatchService = require('../../services/dispatchService');
const AppError = require('../../utils/appErrors');

/**
 * GET /api/admin/dispatch-assignments/by-vehicle/:vehicleId
 * Return active/related dispatch assignments for a given vehicle including pickup/delivery coordinates
 */
exports.getAssignmentsByVehicle = async (req, res, next) => {
  try {
    const { vehicleId } = req.params;
    if (!vehicleId) return res.status(400).json({ success: false, message: 'Missing vehicleId' });

    // Find DispatchAssignment docs that reference this vehicle in assignments
    const docs = await DispatchAssignment.find({ 'assignments.vehicleId': vehicleId })
      .lean();

    // Enrich with invoice -> requestTicket pickup/delivery coordinates when possible
    const enriched = await Promise.all(docs.map(async (doc) => {
      const out = { ...doc };
      try {
        if (doc.invoiceId) {
          const inv = await Invoice.findById(doc.invoiceId).lean();
          if (inv && inv.requestTicketId) {
            const rt = await RequestTicket.findById(inv.requestTicketId).lean();
            out.requestTicket = rt || null;
          }
        }
      } catch (e) {
        // ignore enrichment errors
      }
      return out;
    }));

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
};

/**
 * 7. ĐIỀU PHỐI XE & NHÂN SỰ
 */
exports.suggestOptimalSquad = async (req, res, next) => {
  try {
    const { totalWeight, totalVolume, pickupLocation, requiredSkills } = req.body;
    const squad = await DispatchService.getOptimalSquad(
      totalWeight || 1000,
      totalVolume || 10,
      pickupLocation,
      requiredSkills || []
    );

    res.status(200).json({
      success: true,
      data: squad
    });
  } catch (error) {
    next(new AppError(error.message, 400));
  }
};

/**
 * 7.5 THỰC HIỆN ĐIỀU PHỐI
 */
exports.dispatchVehicles = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const {
      leaderId,
      driverIds,
      staffIds,
      vehicleType,
      vehicleCount,
      routeId,
      estimatedDuration,
      dispatchTime,
      forceProceed
    } = req.body;

    // Truy xuất thông tin SurveyData để lấy khối lượng thực tế
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) throw new AppError('Invoice not found', 404);

    let totalWeight = 1000;
    let totalVolume = 10;

    if (invoice && invoice.requestTicketId) {
      const surveyData = await SurveyData.findOne({
        requestTicketId: invoice.requestTicketId,
        status: 'COMPLETED'
      });
      if (surveyData) {
        totalWeight = surveyData.totalActualWeight || 1000;
        totalVolume = surveyData.totalActualVolume || 10;
      }
    }

    const assignment = await DispatchService.createDispatchAssignment(invoiceId, {
      totalWeight,
      totalVolume,
      leaderId,
      driverIds,
      staffIds,
      vehicleType,
      vehicleCount,
      routeId,
      estimatedDuration,
      dispatchTime,
      forceProceed
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
    next(error); 
    // we use next(error) instead of sending 400 to let errorMiddleware handle AppError properly
  }
};

/**
 * 8. XÁC NHẬN DISPATCH
 */
exports.confirmDispatch = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) throw new AppError('Invoice not found', 404);

    const assignment = await DispatchService.confirmDispatchAssignment(
      invoice.dispatchAssignmentId
    );

    res.status(200).json({
      success: true,
      data: assignment
    });
  } catch (error) {
    next(new AppError(error.message, 400));
  }
};

/**
 * Mới: API để Engine giao diện gọi check availability
 */
exports.checkAvailability = async (req, res, next) => {
  try {
    const { dispatchTime, estimatedDuration } = req.body;
    if (!dispatchTime) {
      throw new AppError('dispatchTime is required', 400);
    }
    
    const duration = estimatedDuration || 480;
    const data = await DispatchService.checkResourceAvailability(dispatchTime, duration);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(new AppError(error.message, 400));
  }
};

module.exports = exports;
