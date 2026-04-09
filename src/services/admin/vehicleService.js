const Vehicle = require('../../models/Vehicle');
const DispatchAssignment = require('../../models/DispatchAssignment');

/**
 * Generate a unique vehicleId in format VCL-XXX where XXX is 3 digits
 */
async function generateVehicleId() {
  const pad = (n) => String(n).padStart(3, '0');
  for (let attempt = 0; attempt < 10; attempt++) {
    const num = Math.floor(Math.random() * 1000); // 0 - 999
    const id = `VCL-${pad(num)}`;
    const exists = await Vehicle.findOne({ vehicleId: id }).lean();
    if (!exists) return id;
  }
  // fallback sequential approach
  const count = await Vehicle.countDocuments();
  return `VCL-${pad((count + 1) % 1000)}`;
}

async function listVehicles(filter = {}) {
  // simple list with optional status filter
  const query = {};
  if (filter.status) query.status = filter.status;
  const vehicles = await Vehicle.find(query).sort({ createdAt: -1 }).lean();

  // Determine which vehicles are currently assigned (in-transit) by checking DispatchAssignment documents.
  // Consider a vehicle assigned if:
  // - There exists a DispatchAssignment document whose overall status is ASSIGNED/CONFIRMED/IN_DISPATCH and that references the vehicle
  // OR
  // - There exists an assignment entry where assignment.status is CONFIRMED/ACCEPTED/IN_PROGRESS
  if (vehicles.length === 0) return vehicles;

  const vehicleObjectIds = vehicles.map(v => v._id);

  const dispatchDocs = await DispatchAssignment.find({
    $or: [
      { status: { $in: ['ASSIGNED', 'CONFIRMED', 'IN_DISPATCH'] }, 'assignments.vehicleId': { $in: vehicleObjectIds } },
      { 'assignments': { $elemMatch: { vehicleId: { $in: vehicleObjectIds }, status: { $in: ['CONFIRMED', 'ACCEPTED', 'IN_PROGRESS'] } } } }
    ]
  }).lean();

  const activeVehicleIdSet = new Set();
  dispatchDocs.forEach(doc => {
    const outerActive = ['ASSIGNED', 'CONFIRMED', 'IN_DISPATCH'].includes(doc.status);
    (doc.assignments || []).forEach(a => {
      if (!a || !a.vehicleId) return;
      const vid = String(a.vehicleId);
      if (outerActive || ['CONFIRMED', 'ACCEPTED', 'IN_PROGRESS'].includes(a.status)) {
        activeVehicleIdSet.add(vid);
      }
    });
  });

  // Set status based on active set; preserve 'Maintenance' if set on vehicle record.
  vehicles.forEach(v => {
    try {
      const idStr = String(v._id);
      if (v.status === 'Maintenance') return; // keep maintenance state
      if (activeVehicleIdSet.has(idStr)) v.status = 'InTransit';
      else v.status = 'Available';
    } catch (e) {
      // ignore
    }
  });

  return vehicles;
}

async function createVehicle(data) {
  // data: { plateNumber, vehicleType, loadCapacity, status }
  // ensure unique plateNumber handled by schema; check beforehand for clearer error
  const existing = await Vehicle.findOne({ plateNumber: data.plateNumber });
  if (existing) {
    const err = new Error('License plate number already exists.');
    err.status = 400;
    throw err;
  }

  const vehicleId = await generateVehicleId();

  const v = new Vehicle({
    vehicleId,
    plateNumber: data.plateNumber,
    vehicleType: data.vehicleType,
    loadCapacity: data.loadCapacity || null,
    status: data.status || 'Available',
    isActive: true,
  });

  await v.save();
  return v.toObject();
}

async function updateVehicleById(vehicleId, data) {
  const v = await Vehicle.findOne({ vehicleId });
  if (!v) {
    const err = new Error('Vehicle not found');
    err.status = 404;
    throw err;
  }

  // If updating plateNumber, ensure uniqueness
  if (data.plateNumber && data.plateNumber !== v.plateNumber) {
    const exists = await Vehicle.findOne({ plateNumber: data.plateNumber });
    if (exists) {
      const err = new Error('License plate number already exists.');
      err.status = 400;
      throw err;
    }
    v.plateNumber = data.plateNumber;
  }

  if (data.vehicleType) v.vehicleType = data.vehicleType;
  if (typeof data.loadCapacity !== 'undefined') v.loadCapacity = data.loadCapacity;
  if (data.status) v.status = data.status;
  if (typeof data.isActive !== 'undefined') v.isActive = data.isActive;

  await v.save();
  return v.toObject();
}

async function deleteVehicleById(vehicleId) {
  const v = await Vehicle.findOne({ vehicleId });
  if (!v) {
    const err = new Error('Vehicle not found');
    err.status = 404;
    throw err;
  }

  // Business rule: cannot delete vehicle assigned or in transit
  if (v.status === 'InTransit') {
    const err = new Error('Vehicle is currently assigned and cannot be deleted.');
    err.status = 400;
    throw err;
  }

  await Vehicle.deleteOne({ vehicleId });
  return true;
}

module.exports = {
  listVehicles,
  createVehicle,
  updateVehicleById,
  deleteVehicleById,
  // Return dashboard stats: counts and breakdowns used by admin FE
  async getDashboard() {
    // total count
    const total = await Vehicle.countDocuments();
    // basic status counts
    const available = await Vehicle.countDocuments({ status: 'Available' });
    const inTransit = await Vehicle.countDocuments({ status: 'InTransit' });
    const maintenance = await Vehicle.countDocuments({ status: 'Maintenance' });

    // counts by vehicleType
    const agg = await Vehicle.aggregate([
      { $group: { _id: '$vehicleType', count: { $sum: 1 } } }
    ]).exec();
    const countsByType = {};
    agg.forEach(a => { countsByType[a._id] = a.count; });

    return { total, available, inTransit, maintenance, countsByType };
  }
  ,
  async getAssignmentsForVehicle(vehicleId, startIso, endIso) {
    // Find vehicle by vehicleId
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return [];

    const vid = vehicle._id;

    // Build time filter if provided
    const start = startIso ? new Date(startIso) : null;
    const end = endIso ? new Date(endIso) : null;

    // Find dispatch documents that contain this vehicle in assignments
    const docs = await DispatchAssignment.find({ 'assignments.vehicleId': vid }).lean();

    const results = [];

    // We'll need Invoice and Route models to enrich data
    const Invoice = require('../../models/Invoice');
    const Route = require('../../models/Route');

    // Iterate and build enriched result per assignment
    for (const doc of docs) {
      const invoiceId = doc.invoiceId;

      // Try to load invoice with populated requestTicket (if exists).
      // Be tolerant: invoiceId may be an ObjectId, an invoice.code, or even a requestTicketId used as a link.
      let invoice = null;
      try {
        if (invoiceId) {
          const asString = String(invoiceId);
          const looksLikeObjectId = /^[0-9a-fA-F]{24}$/.test(asString);

          if (looksLikeObjectId) {
            invoice = await Invoice.findById(asString).populate('requestTicketId').lean();
          }

          // If not found yet, try by code or by requestTicketId
          if (!invoice) {
            invoice = await Invoice.findOne({ $or: [{ code: asString }, { requestTicketId: asString }, { _id: asString }] })
              .populate('requestTicketId')
              .lean();
          }

          // (debug logs removed) — avoid noisy terminal output in production
        }
      } catch (e) {
        invoice = null;
      }

      for (const a of (doc.assignments || [])) {
        try {
          if (!a || !a.vehicleId) continue;
          if (String(a.vehicleId) !== String(vid)) continue;

          const pickup = a.pickupTime ? new Date(a.pickupTime) : null;
          const delivery = a.deliveryTime ? new Date(a.deliveryTime) : null;
          // Filter by provided range (if any) using pickup time primarily
          if (start && pickup && pickup < start) continue;
          if (end && pickup && pickup > end) continue;

          // Extract pickup/delivery coords & addresses from invoice.requestTicketId if available
          let pickupLocation = null;
          let deliveryLocation = null;
          if (invoice && invoice.requestTicketId) {
            const rt = invoice.requestTicketId;
            // Try multiple possible shapes used across codebase for pickup/delivery
            // 1) rt.pickup.coordinates  (Geo array)
            // 2) rt.pickupLocation / rt.pickupCoordinates
            // 3) rt.pickup.lat / rt.pickup.lng
            // 4) rt.pickupLocation.latitude / longitude
            const findCoords = (obj) => {
              if (!obj) return null;
              if (Array.isArray(obj)) return obj; // [lat,lng] or [lng,lat]
              if (Array.isArray(obj.coordinates)) return obj.coordinates; // Geo
              if (Array.isArray(obj.latLng)) return obj.latLng;
              if (typeof obj.latitude === 'number' && typeof obj.longitude === 'number') return [obj.latitude, obj.longitude];
              if (typeof obj.lat === 'number' && typeof obj.lng === 'number') return [obj.lat, obj.lng];
              if (typeof obj.lat === 'string' && typeof obj.lng === 'string') return [Number(obj.lat), Number(obj.lng)];
              return null;
            };

            // pickup
            let pickupCandidate = rt.pickup || rt.pickupLocation || rt.pickupCoordinates || rt.pickupAddress || null;
            let coords = findCoords(pickupCandidate);
            // also check top-level fields
            if (!coords && rt.pickupCoordinates) coords = Array.isArray(rt.pickupCoordinates) ? rt.pickupCoordinates : null;
            if (!coords && rt.pickupLocation && (rt.pickupLocation.coordinates || rt.pickupLocation.lat)) coords = findCoords(rt.pickupLocation);
            if (coords && coords.length >= 2) {
              // normalize to [lat,lng]
              let lat = coords[0];
              let lng = coords[1];
              // if looks like [lng,lat] (lng absolute > 90), swap
              if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
                const tmp = lat; lat = lng; lng = tmp;
              }
              pickupLocation = { lat: Number(lat), lng: Number(lng), address: (rt.pickup && (rt.pickup.address || rt.pickup.formattedAddress)) || rt.pickupAddress || (rt.pickupLocation && rt.pickupLocation.address) || '' };
            }

            // delivery
            let deliveryCandidate = rt.delivery || rt.deliveryLocation || rt.deliveryCoordinates || rt.deliveryAddress || null;
            let dcoords = findCoords(deliveryCandidate);
            if (!dcoords && rt.deliveryCoordinates) dcoords = Array.isArray(rt.deliveryCoordinates) ? rt.deliveryCoordinates : null;
            if (!dcoords && rt.deliveryLocation && (rt.deliveryLocation.coordinates || rt.deliveryLocation.lat)) dcoords = findCoords(rt.deliveryLocation);
            if (dcoords && dcoords.length >= 2) {
              let lat = dcoords[0];
              let lng = dcoords[1];
              if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
                const tmp = lat; lat = lng; lng = tmp;
              }
              deliveryLocation = { lat: Number(lat), lng: Number(lng), address: (rt.delivery && (rt.delivery.address || rt.delivery.formattedAddress)) || rt.deliveryAddress || (rt.deliveryLocation && rt.deliveryLocation.address) || '' };
            }
          }

          // Resolve route document if referenced
          let routeDoc = null;
          const routeRef = a.routeId || doc.routeId || null;
          if (routeRef) {
            try {
              routeDoc = await Route.findById(routeRef).lean();
            } catch (e) {
              routeDoc = null;
            }
          }

          // Compose route coordinates if routeDoc contains roadRestrictions with geometry or any geometry
          let routeCoordinates = [];
          if (routeDoc) {
            // try to concatenate LineString geometries from roadRestrictions as fallback
            if (Array.isArray(routeDoc.roadRestrictions) && routeDoc.roadRestrictions.length > 0) {
              routeDoc.roadRestrictions.forEach(r => {
                if (r.geometry && Array.isArray(r.geometry.coordinates)) {
                  // geometry.coordinates is [[lng, lat], ...]
                  const coords = r.geometry.coordinates.map(c => [Number(c[1]), Number(c[0])]);
                  routeCoordinates = routeCoordinates.concat(coords);
                }
              });
            }
            // If routeDoc has explicit geometry field (future), use that
            if (!routeCoordinates.length && routeDoc.geometry && Array.isArray(routeDoc.geometry.coordinates)) {
              routeCoordinates = routeDoc.geometry.coordinates.map(c => [Number(c[1]), Number(c[0])]);
            }
          }

          results.push({
            dispatchAssignmentId: doc._id,
            invoiceId,
            orderCode: invoice?.code || invoiceId,
            assignmentStatus: a.status,
            pickupTime: pickup,
            deliveryTime: delivery,
            loadWeight: a.loadWeight,
            loadVolume: a.loadVolume,
            routeId: routeRef,
            routeData: routeDoc || null,
            routeCoordinates: routeCoordinates,
            pickupLocation,
            deliveryLocation,
            notes: a.notes || '',
            rawAssignment: a,
            rawDispatch: doc
          });
        } catch (e) {
          // continue on per-assignment errors
        }
      }
    }

    // Optionally sort by pickupTime
    results.sort((x, y) => (x.pickupTime || 0) - (y.pickupTime || 0));
    return results;
  }
};
