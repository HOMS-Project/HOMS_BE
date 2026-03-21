const mongoose = require('mongoose');
const Invoice = require('../../models/Invoice');

/**
 * Return detailed invoice information populated with customer, request ticket and dispatch assignment
 */
const getInvoiceById = async (id) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) throw { statusCode: 400, message: 'Invalid invoice id' };

    const invoice = await Invoice.findById(id)
      .populate('customerId', 'fullName phone email')
  .populate({ path: 'requestTicketId', select: 'pickup delivery code' })
      .populate({
        path: 'dispatchAssignmentId',
        populate: [
          { path: 'assignments.vehicleId', model: 'Vehicle', select: 'plateNumber vehicleId vehicleType' },
          { path: 'assignments.driverIds', model: 'User', select: 'fullName phone' },
          { path: 'assignments.staffIds', model: 'User', select: 'fullName phone' }
        ]
      })
      .lean();

    if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };

    // Normalize output for FE consumption
    const assignedVehicles = [];
    const assignedDrivers = [];
    const assignedStaff = [];

    if (invoice.dispatchAssignmentId && Array.isArray(invoice.dispatchAssignmentId.assignments)) {
      invoice.dispatchAssignmentId.assignments.forEach((a) => {
        if (a.vehicleId) assignedVehicles.push({
          _id: a.vehicleId._id || a.vehicleId,
          plateNumber: a.vehicleId.plateNumber,
          vehicleId: a.vehicleId.vehicleId,
          vehicleType: a.vehicleId.vehicleType
        });

        if (Array.isArray(a.driverIds)) {
          a.driverIds.forEach(d => {
            if (d) assignedDrivers.push({ _id: d._id || d, fullName: d.fullName, phone: d.phone });
          });
        }

        if (Array.isArray(a.staffIds)) {
          a.staffIds.forEach(s => {
            if (s) assignedStaff.push({ _id: s._id || s, fullName: s.fullName, phone: s.phone });
          });
        }
      });
    }

    // deduplicate by _id
    const uniqById = (items) => {
      const map = new Map();
      (items || []).forEach(it => {
        const id = it && (it._id || it.id || it.vehicleId);
        if (!id) return;
        const key = typeof id === 'object' ? String(id) : String(id);
        if (!map.has(key)) map.set(key, it);
      });
      return Array.from(map.values());
    };

    // compute lastTimelineUpdatedAt from timeline (most recent timeline.updatedAt)
    // Robustness: filter out invalid dates, fall back to updatedAt then createdAt when available
    const computeLastTimeline = (inv) => {
      if (Array.isArray(inv.timeline) && inv.timeline.length) {
        const times = inv.timeline
          .map(t => t && t.updatedAt ? new Date(t.updatedAt).getTime() : NaN)
          .filter(ts => !Number.isNaN(ts));
        if (times.length) {
          const ms = Math.max(...times);
          return new Date(ms).toISOString();
        }
      }
      if (inv.updatedAt) return new Date(inv.updatedAt).toISOString();
      if (inv.createdAt) return new Date(inv.createdAt).toISOString();
      return null;
    };

    return {
      ...invoice,
      customer: invoice.customerId || null,
      pickup: invoice.requestTicketId?.pickup || null,
      delivery: invoice.requestTicketId?.delivery || null,
      // provide lastTimelineUpdatedAt for front-end to use
      lastTimelineUpdatedAt: computeLastTimeline(invoice),
      assignedVehicles: uniqById(assignedVehicles),
      assignedDrivers: uniqById(assignedDrivers),
      assignedStaff: uniqById(assignedStaff)
    };
  } catch (err) {
    console.error('invoiceService.getInvoiceById error:', err && err.message ? err.message : err);
    throw err;
  }
};

// List invoices with pagination and simple filtering
const getInvoices = async ({ page = 1, limit = 20, search = '', status } = {}) => {
  try {
    const query = {};
    if (status) {
      // support multiple statuses (array or comma-separated string)
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else if (typeof status === 'string' && status.includes(',')) {
        const arr = status.split(',').map(s => s.trim()).filter(Boolean);
        if (arr.length) query.status = { $in: arr };
      } else {
        query.status = status;
      }
    }
    if (search && String(search).trim()) {
      // simple search against invoice code, request ticket code and customer fields
      const s = String(search).trim();
      query.$or = [
        { code: { $regex: s, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('customerId', 'fullName phone email')
  .populate({ path: 'requestTicketId', select: 'pickup delivery code' })
        .populate({
          path: 'dispatchAssignmentId',
          populate: [
            { path: 'assignments.vehicleId', model: 'Vehicle', select: 'plateNumber vehicleId vehicleType' },
            { path: 'assignments.driverIds', model: 'User', select: 'fullName phone' },
            { path: 'assignments.staffIds', model: 'User', select: 'fullName phone' }
          ]
        })
        .lean(),
      Invoice.countDocuments(query)
    ]);

    // normalize similar to getInvoiceById
    const normalize = (invoice) => {
      const assignedVehicles = [];
      const assignedDrivers = [];
      const assignedStaff = [];

      if (invoice.dispatchAssignmentId && Array.isArray(invoice.dispatchAssignmentId.assignments)) {
        invoice.dispatchAssignmentId.assignments.forEach((a) => {
          if (a.vehicleId) assignedVehicles.push({
            _id: a.vehicleId._id || a.vehicleId,
            plateNumber: a.vehicleId.plateNumber,
            vehicleId: a.vehicleId.vehicleId,
            vehicleType: a.vehicleId.vehicleType
          });
          if (Array.isArray(a.driverIds)) {
            a.driverIds.forEach(d => { if (d) assignedDrivers.push({ _id: d._id || d, fullName: d.fullName, phone: d.phone }); });
          }
          if (Array.isArray(a.staffIds)) {
            a.staffIds.forEach(s => { if (s) assignedStaff.push({ _id: s._id || s, fullName: s.fullName, phone: s.phone }); });
          }
        });
      }

      const uniqById = (items) => {
        const map = new Map();
        (items || []).forEach(it => {
          const id = it && (it._id || it.id || it.vehicleId);
          if (!id) return;
          const key = typeof id === 'object' ? String(id) : String(id);
          if (!map.has(key)) map.set(key, it);
        });
        return Array.from(map.values());
      };

      // compute lastTimelineUpdatedAt (robust)
      const computeLastTimeline = (inv) => {
        if (Array.isArray(inv.timeline) && inv.timeline.length) {
          const times = inv.timeline
            .map(t => t && t.updatedAt ? new Date(t.updatedAt).getTime() : NaN)
            .filter(ts => !Number.isNaN(ts));
          if (times.length) {
            const ms = Math.max(...times);
            return new Date(ms).toISOString();
          }
        }
        if (inv.updatedAt) return new Date(inv.updatedAt).toISOString();
        if (inv.createdAt) return new Date(inv.createdAt).toISOString();
        return null;
      };

      return {
        ...invoice,
        customer: invoice.customerId || null,
        pickup: invoice.requestTicketId?.pickup || null,
        delivery: invoice.requestTicketId?.delivery || null,
        lastTimelineUpdatedAt: computeLastTimeline(invoice),
        assignedVehicles: uniqById(assignedVehicles),
        assignedDrivers: uniqById(assignedDrivers),
        assignedStaff: uniqById(assignedStaff)
      };
    };

    return {
      invoices: invoices.map(normalize),
      total,
      currentPage: Number(page),
      limit: Number(limit)
    };
  } catch (err) {
    console.error('invoiceService.getInvoices error:', err && err.message ? err.message : err);
    throw err;
  }
};

module.exports = {
  getInvoices,
  getInvoiceById
};

// Aggregate revenue for PAID and PARTIAL invoices (server-side total)
const getRevenueAggregate = async ({ search = '' } = {}) => {
  try {
    // build match: only consider PAID and PARTIAL as business rule
    const match = { paymentStatus: { $in: ['PAID', 'PARTIAL'] } };
    if (search && String(search).trim()) {
      const s = String(search).trim();
      match.$or = [
        { code: { $regex: s, $options: 'i' } }
      ];
    }

    // Match PAID and PARTIAL, then sum the invoice total price (same as dashboard behavior)
    const pipeline = [
      { $match: match },
      { $group: { _id: null, totalRevenue: { $sum: { $ifNull: ['$priceSnapshot.totalPrice', { $ifNull: ['$total', 0] }] } } } },
      { $project: { _id: 0, totalRevenue: 1 } }
    ];

    const res = await Invoice.aggregate(pipeline);
    if (res && res[0]) return res[0].totalRevenue || 0;
    return 0;
  } catch (err) {
    console.error('invoiceService.getRevenueAggregate error:', err && err.message ? err.message : err);
    throw err;
  }
};

module.exports = {
  getInvoices,
  getInvoiceById,
  getRevenueAggregate
};