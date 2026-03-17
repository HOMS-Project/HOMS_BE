const mongoose = require('mongoose');
const Invoice = require('../../models/Invoice');

/**
 * Return detailed invoice information populated with customer, request ticket and dispatch assignment
 */
const getInvoiceById = async (id) => {
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

  // deduplicate by _id (some assignments may reference same people/vehicles multiple times)
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

  return {
    ...invoice,
    customer: invoice.customerId || null,
    pickup: invoice.requestTicketId?.pickup || null,
    delivery: invoice.requestTicketId?.delivery || null,
    assignedVehicles: uniqById(assignedVehicles),
    assignedDrivers: uniqById(assignedDrivers),
    assignedStaff: uniqById(assignedStaff)
  };
};

module.exports = {
  getInvoiceById
};
