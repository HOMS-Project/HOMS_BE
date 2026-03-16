const incidentService = require("../services/incidentService");
const RequestTicket = require("../models/RequestTicket"); // to resolve ticketId → invoiceId

// ─── Helper ───────────────────────────────────────────────────────────────────
const sendError = (res, err) => {
  const status = err.statusCode || 500;
  return res.status(status).json({ success: false, message: err.message });
};

// ─── POST /incidents ──────────────────────────────────────────────────────────
// Body: { ticketId, type, description, mediaUrls? }
// Files: multipart/form-data field "media" (optional, max 5)
const createIncident = async (req, res) => {
  try {
    const { ticketId, invoiceId, type, description } = req.body;

    const reporterId = req.user.id; 

    if (!ticketId || !invoiceId|| !type || !description) {
      return res.status(400).json({
        success: false,
        message: "ticketId,invoiceId type và description là bắt buộc.",
      });
    }  
    // req.files: populated by multer (memoryStorage)
    const files = req.files || [];

    const incident = await incidentService.createIncident(
  invoiceId,
  reporterId,
  { type, description },
  files
);

    return res.status(201).json({
      success: true,
      message: "Báo cáo sự cố đã được gửi thành công.",
      data: incident,
    });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── GET /invoices/:invoiceId/incidents ───────────────────────────────────────
const getIncidentsByInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const incidents = await incidentService.getIncidentsByInvoice(invoiceId);

    return res.status(200).json({ success: true, data: incidents });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── GET /incidents/:id ───────────────────────────────────────────────────────
const getIncidentById = async (req, res) => {
  try {
    const incident = await incidentService.getIncidentById(req.params.id);
    return res.status(200).json({ success: true, data: incident });
  } catch (err) {
    return sendError(res, err);
  }
};

// ─── PATCH /incidents/:id/resolve ────────────────────────────────────────────
// Body: { status, action, compensationAmount }
const resolveIncident = async (req, res) => {
  try {
    const updated = await incidentService.resolveIncident(
      req.params.id,
      req.body
    );
    return res.status(200).json({
      success: true,
      message: "Đã cập nhật trạng thái sự cố.",
      data: updated,
    });
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports = {
  createIncident,
  getIncidentsByInvoice,
  getIncidentById,
  resolveIncident,
};