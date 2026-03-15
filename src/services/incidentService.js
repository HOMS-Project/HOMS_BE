const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const Incident = require("../models/Incident");
const Invoice = require("../models/Invoice");

// ─── Cloudinary config (expects env vars) ────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Helper: upload a single Buffer → Cloudinary via streaming ───────────────
const uploadToCloudinary = (fileBuffer, originalName) => {
  return new Promise((resolve, reject) => {
    const publicId = `incidents/${Date.now()}_${originalName.replace(/\s+/g, "_")}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: "auto",   // handles images AND videos
        folder: "incidents",
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );

    // Pipe the in-memory buffer into the Cloudinary stream
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

// ─── Upload multiple files concurrently ──────────────────────────────────────
const uploadMediaFiles = async (files = []) => {
  if (!files.length) return [];

  const uploadPromises = files.map((file) =>
    uploadToCloudinary(file.buffer, file.originalname)
  );

  return Promise.all(uploadPromises);
};

// ─── Create incident ─────────────────────────────────────────────────────────
/**
 * @param {string}   invoiceId   - Invoice._id
 * @param {string}   reporterId  - User._id (customer)
 * @param {object}   body        - { type, description }
 * @param {Array}    files       - multer file objects (buffer + originalname)
 */
const createIncident = async (invoiceId, reporterId, body, files = []) => {
  // 1. Verify the invoice exists
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) {
    const err = new Error("Không tìm thấy hóa đơn tương ứng.");
    err.statusCode = 404;
    throw err;
  }

  // 2. Validate type value against schema enum
  const allowedTypes = ["Damage", "Delay", "Accident", "Loss", "Other"];
  // FE sends uppercase short codes; map them to schema values
  const typeMap = {
    DAMAGE: "Damage",
    LOSS: "Loss",
    STAFF: "Other",   // closest match
    OTHER: "Other",
  };
  const resolvedType = typeMap[body.type] || body.type;
  if (!allowedTypes.includes(resolvedType)) {
    const err = new Error(`Loại sự cố không hợp lệ: ${body.type}`);
    err.statusCode = 400;
    throw err;
  }

  // 3. Upload media to Cloudinary (streaming)
  const mediaUrls = await uploadMediaFiles(files);

  // 4. Persist
  const incident = await Incident.create({
    invoiceId,
    reporterId,
    type: resolvedType,
    description: body.description,
    images: mediaUrls,
    status: "Open",
  });

  return incident;
};

// ─── Get all incidents for one invoice ───────────────────────────────────────
const getIncidentsByInvoice = async (invoiceId) => {
  return Incident.find({ invoiceId })
    .populate("reporterId", "fullName email phone")
    .sort({ createdAt: -1 });
};

// ─── Get single incident ──────────────────────────────────────────────────────
const getIncidentById = async (incidentId) => {
  const incident = await Incident.findById(incidentId)
    .populate("reporterId", "fullName email phone")
    .populate("invoiceId");

  if (!incident) {
    const err = new Error("Không tìm thấy sự cố.");
    err.statusCode = 404;
    throw err;
  }
  return incident;
};

// ─── Update incident status / resolution (staff/admin) ───────────────────────
const resolveIncident = async (incidentId, resolutionData) => {
  const { status, action, compensationAmount } = resolutionData;

  const incident = await Incident.findById(incidentId);
  if (!incident) {
    const err = new Error("Không tìm thấy sự cố.");
    err.statusCode = 404;
    throw err;
  }

  incident.status = status || incident.status;

  if (action || compensationAmount != null) {
    incident.resolution = {
      action: action || incident.resolution?.action,
      compensationAmount:
        compensationAmount ?? incident.resolution?.compensationAmount,
      resolvedAt: new Date(),
    };
  }

  await incident.save();
  return incident;
};

module.exports = {
  createIncident,
  getIncidentsByInvoice,
  getIncidentById,
  resolveIncident,
};