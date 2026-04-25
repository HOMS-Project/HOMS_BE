const mongoose = require("mongoose");
const Incident = require("../../models/Incident");
const Invoice = require("../../models/Invoice");
const User = require("../../models/User");

/**
 * List incidents for admin with optional search, type, status and pagination.
 * Search matches incident _id, invoice.code, or reporter.fullName.
 */
const listIncidents = async ({
  search,
  type,
  status,
  page = 1,
  limit = 10,
}) => {
  const match = {};

  if (type && type !== "all") match.type = type;
  if (status && status !== "all") match.status = status;

  const pipeline = [];

  // join invoice
  pipeline.push({
    $lookup: {
      from: "invoices",
      localField: "invoiceId",
      foreignField: "_id",
      as: "invoice",
    },
  });
  pipeline.push({
    $unwind: { path: "$invoice", preserveNullAndEmptyArrays: true },
  });

  // join reporter (user)
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "reporterId",
      foreignField: "_id",
      as: "reporter",
    },
  });
  pipeline.push({
    $unwind: { path: "$reporter", preserveNullAndEmptyArrays: true },
  });

  // apply simple field filters
  if (Object.keys(match).length > 0) pipeline.push({ $match: match });

  // search across multiple fields
  if (search) {
    const regex = new RegExp(
      search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    pipeline.push({
      $match: {
        $or: [
          { _id: { $regex: regex } },
          { "invoice.code": { $regex: regex } },
          { "reporter.fullName": { $regex: regex } },
        ],
      },
    });
  }

  // sorting + pagination using facet to get total count
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);

  pipeline.push({
    $facet: {
      metadata: [{ $count: "total" }],
      data: [
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Math.max(1, limit) },
        {
          $project: {
            invoiceId: { _id: "$invoice._id", code: "$invoice.code" },
            invoiceCode: "$invoice.code",
            reporterId: {
              _id: "$reporter._id",
              fullName: "$reporter.fullName",
              phone: "$reporter.phone",
            },
            type: 1,
            description: 1,
            images: 1,
            status: 1,
            resolution: 1,
            createdAt: 1,
          },
        },
      ],
    },
  });

  const agg = await Incident.aggregate(pipeline).allowDiskUse(true);
  const metadata = (agg[0] && agg[0].metadata && agg[0].metadata[0]) || {
    total: 0,
  };
  const data = (agg[0] && agg[0].data) || [];

  return {
    total: metadata.total || 0,
    page: Number(page) || 1,
    limit: Number(limit) || 10,
    data,
  };
};

const getIncidentById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id))
    throw { statusCode: 400, message: "Invalid incident id" };
  const incident = await Incident.findById(id)
    .populate({ path: "invoiceId", select: "code _id" })
    .populate({ path: "reporterId", select: "fullName phone _id" })
    .lean();
  if (!incident) throw { statusCode: 404, message: "Incident not found" };
  // normalize populated fields to match frontend expectations
  return {
    ...incident,
    invoiceCode: incident.invoiceId?.code || null,
    invoiceId: incident.invoiceId || null,
    reporterId: incident.reporterId || null,
  };
};

const resolveIncident = async (id, payload = {}, user = null) => {
  if (!mongoose.Types.ObjectId.isValid(id))
    throw { statusCode: 400, message: "Invalid incident id" };

  const incident = await Incident.findById(id);
  if (!incident) throw { statusCode: 404, message: "Incident not found" };

  // update status
  if (payload.status) incident.status = payload.status;

  // update resolution fields
  incident.resolution = incident.resolution || {};
  if (payload.action) incident.resolution.action = payload.action;
  if (typeof payload.compensationAmount !== "undefined")
    incident.resolution.compensationAmount =
      Number(payload.compensationAmount) || 0;
  // save admin note if provided
  if (typeof payload.note !== "undefined")
    incident.resolution.note = payload.note;
  // set resolvedAt when marking resolved, prefer provided resolvedAt
  if (payload.resolvedAt)
    incident.resolution.resolvedAt = new Date(payload.resolvedAt);
  else if (incident.status === "Resolved")
    incident.resolution.resolvedAt =
      incident.resolution.resolvedAt || new Date();

  // optional: keep who resolved
  if (user && user.userId) incident.resolution.resolvedBy = user.userId;

  await incident.save();

  // return populated object
  return getIncidentById(id);
};

module.exports = {
  listIncidents,
  getIncidentById,
  resolveIncident,
  // dashboard stats for admin UI
  async getDashboard() {
    // total incidents
    const total = await Incident.countDocuments();

    // open incidents (status === 'Open')
    const open = await Incident.countDocuments({ status: 'Open' });

    // investigating (status === 'Investigating')
    const investigating = await Incident.countDocuments({ status: 'Investigating' });

    // compensation requests: incidents with a requested compensation amount > 0 or resolution.action === 'Compensation'
    const compensation = await Incident.countDocuments({
      $or: [
        { 'resolution.compensationAmount': { $gt: 0 } },
        { 'resolution.action': 'Compensation' }
      ]
    });

    return { total, open, investigating, compensation };
  }
};
