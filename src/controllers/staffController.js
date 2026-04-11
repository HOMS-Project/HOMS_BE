const DispatchAssignment = require("../models/DispatchAssignment");
const axios = require("axios"); // Added for proxying
const Invoice = require("../models/Invoice");
const User = require("../models/User");
const Route = require("../models/Route");
const SurveyData = require("../models/SurveyData");
const AppError = require("../utils/appErrors");
const staffEvidenceService = require("../services/staffEvidenceService");

const stripSecTag = (value) => {
  if (typeof value !== "string") return value;
  return value.replace(/^\s*\[SEC:[^\]]+\]\s*/i, "").trim();
};

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return String(value);
};

const hasMemberId = (members, targetId) => {
  if (!Array.isArray(members) || !targetId) return false;
  const normalizedTarget = String(targetId);
  return members.some((member) => normalizeId(member) === normalizedTarget);
};

const isPersonalAssignment = (assignment, staffId) =>
  hasMemberId(assignment?.driverIds, staffId) ||
  hasMemberId(assignment?.staffIds, staffId);

// Helper to normalize coordinates: assuming larger number (>100) is Longitude (Vietnam)
const normalizePoint = (coord) => {
  if (!coord) return null;
  const lat = coord.lat ?? coord[1] ?? 0;
  const lng = coord.lng ?? coord[0] ?? 0;
  // Vietnam: Lng is ~104-109, Lat is ~8-23
  if (lat > lng) return { lat: lng, lng: lat };
  return { lat, lng };
};

/**
 * GET /api/staff/orders
 * Lấy danh sách các đơn hàng được phân công cho nhân viên hiện tại
 */
exports.getAssignedOrders = async (req, res, next) => {
  try {
    const staffId = req.user.userId || req.user._id || req.user.id;
    const normalizedStaffId = normalizeId(staffId);

    // Tìm các DispatchAssignment có chứa staffId trong driverIds hoặc staffIds của bất kỳ assignment nào
    const assignments = await DispatchAssignment.find({
      $or: [
        { "assignments.driverIds": staffId },
        { "assignments.staffIds": staffId },
      ],
    })
      .populate({
        path: "invoiceId",
        populate: {
          path: "requestTicketId",
          select: "code pickup delivery items customerId",
        },
      })
      .populate("assignments.routeId");

    // Lọc ra các assignment cụ thể mà staffId tham gia và định dạng lại dữ liệu
    const formattedOrders = assignments
      .map((da) => {
        const invoice = da.invoiceId;
        if (!invoice || !invoice.requestTicketId) return null;

        const ticket = invoice.requestTicketId;

        // Lấy assignment cụ thể cho staff này
        const personalAssignment = da.assignments.find((a) =>
          isPersonalAssignment(a, staffId),
        );

        return {
          dispatchAssignmentId: da._id,
          assignmentId: personalAssignment ? personalAssignment._id : null,
          invoiceId: invoice._id,
          id: invoice._id, // Trả thêm ID dự phòng cho mobile
          orderCode: ticket.code,
          status: personalAssignment ? personalAssignment.status : da.status,
          routeId: personalAssignment ? personalAssignment.routeId : null,
          pickup: ticket.pickup,
          delivery: ticket.delivery,
          scheduledTime: invoice.scheduledTime,
          items: ticket.items,
        };
      })
      .filter((order) => order !== null);

    res.status(200).json({
      success: true,
      data: formattedOrders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/staff/orders/:invoiceId
 * Lấy chi tiết đơn hàng bao gồm thông tin khách hàng
 */
exports.getOrderDetails = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await Invoice.findById(invoiceId)
      .populate({
        path: "requestTicketId",
        populate: {
          path: "customerId",
          select: "fullName phone phoneNumber email avatar",
        },
      })
      .populate({
        path: "customerId",
        select: "fullName phone phoneNumber email avatar",
      })
      .populate("routeId");

    if (!invoice) {
      throw new AppError("Invoice not found", 404);
    }

    const ticket = invoice.requestTicketId;
    const ticketCustomer = ticket?.customerId || null;
    const invoiceCustomer = invoice?.customerId || null;
    const customer = ticketCustomer || invoiceCustomer || {};
    const customerName =
      customer.fullName || invoiceCustomer?.fullName || "Khách hàng";
    const customerPhone =
      customer.phone ||
      customer.phoneNumber ||
      invoiceCustomer?.phone ||
      invoiceCustomer?.phoneNumber ||
      "";
    const customerEmail = customer.email || invoiceCustomer?.email || "";
    const customerAvatar = customer.avatar || invoiceCustomer?.avatar || "";

    // Find the assignment specifically for this staff/driver to get its route validation
    const staffId = req.user.userId || req.user._id || req.user.id;
    const normalizedStaffId = normalizeId(staffId);
    const da = await DispatchAssignment.findOne({
      invoiceId,
      $or: [
        { "assignments.driverIds": staffId },
        { "assignments.staffIds": staffId },
      ],
    })
      .populate("assignments.routeId")
      .populate("assignments.vehicleId", "plateNumber vehicleType")
      .populate("assignments.driverIds", "fullName phone avatar")
      .populate("assignments.staffIds", "fullName phone avatar");

    // Find personal assignment once and reuse it
    let personalAssignment = null;
    let routeValidation = null;

    if (da) {
      personalAssignment = da.assignments.find((a) =>
        isPersonalAssignment(a, staffId),
      );
      if (personalAssignment) {
        routeValidation = personalAssignment.routeValidation;
      }
    }

    const teamDrivers = Array.isArray(personalAssignment?.driverIds)
      ? personalAssignment.driverIds.map((member) => ({
          id: normalizeId(member),
          fullName: member?.fullName || "Chưa có tên",
          phone: member?.phone || "",
          avatar: member?.avatar || "",
          isCurrentUser: normalizeId(member) === normalizedStaffId,
        }))
      : [];

    const teamAssistants = Array.isArray(personalAssignment?.staffIds)
      ? personalAssignment.staffIds.map((member) => ({
          id: normalizeId(member),
          fullName: member?.fullName || "Chưa có tên",
          phone: member?.phone || "",
          avatar: member?.avatar || "",
          isCurrentUser: normalizeId(member) === normalizedStaffId,
        }))
      : [];

    // Lấy dữ liệu khảo sát (nếu có) cho ticket này
    const survey = await SurveyData.findOne({
      requestTicketId: ticket._id,
    }).lean();

    const ticketItems = Array.isArray(ticket.items) ? ticket.items : [];
    const surveyItems = Array.isArray(survey?.items) ? survey.items : [];
    const resolvedItems = (
      ticketItems.length > 0 ? ticketItems : surveyItems
    ).map((item) => ({
      ...item,
      name: stripSecTag(item?.name),
    }));

    const timelineEntries = Array.isArray(invoice.timeline)
      ? invoice.timeline
      : [];
    const pickupProofEntry = [...timelineEntries]
      .reverse()
      .find((entry) => entry?.status === "PICKUP_PROOF");
    const dropoffProofEntry = [...timelineEntries]
      .reverse()
      .find((entry) => entry?.status === "DROPOFF_PROOF");

    res.status(200).json({
      success: true,
      data: {
        id: invoice._id,
        invoiceId: invoice._id,
        assignmentId: personalAssignment?._id || null,
        assignmentStatus: personalAssignment?.status || null,
        orderCode: ticket.code,
        status: invoice.status,
        pickup: {
          ...ticket.pickup,
          coordinates: normalizePoint(ticket.pickup?.coordinates),
        },
        delivery: {
          ...ticket.delivery,
          coordinates: normalizePoint(ticket.delivery?.coordinates),
        },
        items: resolvedItems,
        scheduledTime: invoice.scheduledTime,
        customer: {
          name: customerName,
          phone: String(customerPhone || ""),
          email: customerEmail,
          avatar: customerAvatar,
        },
        team: {
          vehicle: personalAssignment?.vehicleId
            ? {
                plateNumber:
                  personalAssignment.vehicleId.plateNumber ||
                  personalAssignment.vehicleId.licensePlate ||
                  "",
                vehicleType:
                  personalAssignment.vehicleId.vehicleType ||
                  personalAssignment.vehicleId.type ||
                  "",
              }
            : null,
          drivers: teamDrivers,
          assistants: teamAssistants,
        },
        route: personalAssignment?.routeId || invoice.routeId,
        routeValidation: routeValidation,
        completionEvidence: {
          beforeImages: invoice.completionEvidence?.beforeImages || [],
          afterImages: invoice.completionEvidence?.afterImages || [],
          beforeNote:
            invoice.completionEvidence?.beforeNote ||
            pickupProofEntry?.notes ||
            "",
          afterNote:
            invoice.completionEvidence?.afterNote ||
            dropoffProofEntry?.notes ||
            "",
        },
        restrictions:
          (personalAssignment?.routeId || invoice.routeId)?.roadRestrictions
            ?.flatMap((res) =>
              res.geometry.type === "LineString"
                ? res.geometry.coordinates
                : [res.geometry.coordinates],
            )
            .map(normalizePoint) || [],
        survey: survey
          ? {
              distanceKm: survey.distanceKm,
              floors: survey.floors,
              hasElevator: survey.hasElevator,
              carryMeter: survey.carryMeter,
              needsPacking: survey.needsPacking,
              needsAssembling: survey.needsAssembling,
              insuranceRequired: survey.insuranceRequired,
              suggestedVehicle: survey.suggestedVehicle,
              suggestedStaffCount: survey.suggestedStaffCount,
              items: survey.items || [],
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/staff/assignments/:assignmentId/status
 * Cập nhật trạng thái của phân công cụ thể
 */
exports.updateAssignmentStatus = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { status, notes } = req.body;

    const da = await DispatchAssignment.findOne({
      "assignments._id": assignmentId,
    });
    if (!da) {
      throw new AppError("Assignment not found", 404);
    }

    const assignmentIndex = da.assignments.findIndex(
      (a) => a._id.toString() === assignmentId,
    );
    da.assignments[assignmentIndex].status = status;

    if (status === "COMPLETED") {
      da.assignments[assignmentIndex].completedAt = new Date();
    } else if (
      status === "IN_PROGRESS" &&
      !da.assignments[assignmentIndex].confirmedAt
    ) {
      da.assignments[assignmentIndex].confirmedAt = new Date();
    }

    await da.save();

    // Nếu tất cả các assignment con đều COMPLETED, cập nhật trạng thái cha
    const allCompleted = da.assignments.every((a) => a.status === "COMPLETED");
    if (allCompleted) {
      da.status = "COMPLETED";
      await da.save();

      await Invoice.findByIdAndUpdate(da.invoiceId, {
        status: "COMPLETED",
        $push: {
          timeline: {
            status: "COMPLETED",
            updatedBy: req.user.userId || req.user._id,
            updatedAt: new Date(),
            notes: "All staff completed their assignments",
          },
        },
      });
    } else if (status === "ACCEPTED") {
      // Nếu cập nhật thành ACCEPTED, Invoice cũng là ACCEPTED
      await Invoice.findByIdAndUpdate(da.invoiceId, { status: "ACCEPTED" });
    } else if (status === "IN_PROGRESS") {
      // Nếu có ít nhất 1 cái IN_PROGRESS, Invoice cũng là IN_PROGRESS
      await Invoice.findByIdAndUpdate(da.invoiceId, { status: "IN_PROGRESS" });
    }

    res.status(200).json({
      success: true,
      message: `Assignment status updated to ${status}`,
      data: da.assignments[assignmentIndex],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/staff/assignments/:assignmentId/route
 * Driver báo cáo đổi lộ trình (Traffic jam, closed road, etc.)
 */
exports.updateAssignmentRoute = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    const { routeId, reason, note } = req.body;

    const da = await DispatchAssignment.findOne({
      "assignments._id": assignmentId,
    });
    if (!da) {
      throw new AppError("Assignment not found", 404);
    }

    const assignmentIndex = da.assignments.findIndex(
      (a) => a._id.toString() === assignmentId,
    );

    // Add deviation record
    da.assignments[assignmentIndex].routeDeviations.push({
      routeId: da.assignments[assignmentIndex].routeId, // Lộ trình cũ
      reason: reason || "Thay đổi lộ trình",
      note: note,
      reportedAt: new Date(),
    });

    // Update to new route
    if (routeId) {
      da.assignments[assignmentIndex].routeId = routeId;
    }

    await da.save();

    res.status(200).json({
      success: true,
      message: "Assignment route updated successfully",
      data: da.assignments[assignmentIndex],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/staff/orders/:invoiceId/pickup
 * Staff uploads pre-trip evidence (photos/note)
 */
exports.submitPickupProof = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const note = req.body?.note || "";
    const files = req.files || [];

    if (!files.length && !note.trim()) {
      throw new AppError("Vui lòng gửi ít nhất 1 ảnh hoặc ghi chú.", 400);
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new AppError("Invoice not found", 404);
    }

    const imageUrls = await staffEvidenceService.uploadImages(
      files,
      "staff-evidence/pickup",
    );

    // Persist evidence
    const existing = invoice.completionEvidence?.beforeImages || [];
    invoice.completionEvidence = invoice.completionEvidence || {};
    invoice.completionEvidence.beforeImages = [...existing, ...imageUrls];
    if (note.trim()) {
      invoice.completionEvidence.beforeNote = note.trim();
    }

    // Append timeline entry for traceability
    invoice.timeline = invoice.timeline || [];
    invoice.timeline.push({
      status: "PICKUP_PROOF",
      updatedBy: req.user?.userId || req.user?._id,
      updatedAt: new Date(),
      notes: note || undefined,
    });

    await invoice.save();

    res.status(200).json({
      success: true,
      message: "Pre-trip evidence uploaded",
      data: { imageUrls, note: note || null },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/staff/orders/:invoiceId/dropoff
 * Staff uploads arrival/completion evidence (photos/note)
 */
exports.submitDropoffProof = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const note = req.body?.note || "";
    const files = req.files || [];

    if (!files.length && !note.trim()) {
      throw new AppError("Vui lòng gửi ít nhất 1 ảnh hoặc ghi chú.", 400);
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new AppError("Invoice not found", 404);
    }

    const imageUrls = await staffEvidenceService.uploadImages(
      files,
      "staff-evidence/dropoff",
    );

    // Persist evidence
    const existing = invoice.completionEvidence?.afterImages || [];
    invoice.completionEvidence = invoice.completionEvidence || {};
    invoice.completionEvidence.afterImages = [...existing, ...imageUrls];
    if (note.trim()) {
      invoice.completionEvidence.afterNote = note.trim();
    }

    // Append timeline entry for traceability
    invoice.timeline = invoice.timeline || [];
    invoice.timeline.push({
      status: "DROPOFF_PROOF",
      updatedBy: req.user?.userId || req.user?._id,
      updatedAt: new Date(),
      notes: note || undefined,
    });

    await invoice.save();

    res.status(200).json({
      success: true,
      message: "Arrival evidence uploaded",
      data: { imageUrls, note: note || null },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/staff/routing/osrm
 * Proxy OSRM requests to avoid mobile network/CORS issues
 */
exports.getProxyRoute = async (req, res, next) => {
  try {
    const { p1, p2 } = req.query; // Format: "lng,lat"
    if (!p1 || !p2) {
      throw new AppError("Thiếu tọa độ p1 hoặc p2.", 400);
    }

    const url = `https://router.project-osrm.org/route/v1/driving/${p1};${p2}?overview=full&geometries=geojson`;
    const response = await axios.get(url, { timeout: 10000 });

    res.status(200).json(response.data);
  } catch (error) {
    console.error("[ProxyRoute] Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lấy thông tin lộ trình từ server điều phối.",
      error: error.message,
    });
  }
};
