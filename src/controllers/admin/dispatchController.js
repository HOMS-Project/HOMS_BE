const DispatchAssignment = require('../../models/DispatchAssignment');
const Invoice = require('../../models/Invoice');
const RequestTicket = require('../../models/RequestTicket');

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

module.exports = exports;
