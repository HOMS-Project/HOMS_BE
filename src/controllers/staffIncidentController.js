const incidentService = require("../services/incidentService");

const getReporterId = (req) =>
  req.user?.userId || req.user?._id || req.user?.id;

exports.getIncidentTypes = async (_req, res, next) => {
  try {
    const types = incidentService.getIncidentTypeOptions();
    res.status(200).json({
      success: true,
      data: types,
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyIncidents = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);
    const incidents = await incidentService.getIncidentsByReporter(reporterId);

    const formatted = incidents.map((incident) => {
      const invoice = incident.invoiceId || {};
      const ticket = invoice.requestTicketId || {};

      return {
        id: incident._id,
        invoiceId: invoice._id || null,
        // Prefer invoice code (INV-...) so staff/admin views stay consistent.
        invoiceCode: invoice.code || ticket.code || String(invoice._id || ""),
        type: incident.type,
        status: incident.status,
        description: incident.description || "",
        images: Array.isArray(incident.images) ? incident.images : [],
        createdAt: incident.createdAt,
        updatedAt: incident.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
};

exports.createIncident = async (req, res, next) => {
  try {
    const reporterId = getReporterId(req);
    const { invoiceId, type, description } = req.body;
    const files = req.files || [];

    const incident = await incidentService.createIncidentByStaff(
      invoiceId,
      reporterId,
      { type, description },
      files,
    );

    res.status(201).json({
      success: true,
      message: "Đã gửi báo cáo sự cố thành công.",
      data: incident,
    });
  } catch (error) {
    next(error);
  }
};
