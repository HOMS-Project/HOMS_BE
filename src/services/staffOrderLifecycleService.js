const DispatchAssignment = require("../models/DispatchAssignment");
const Invoice = require("../models/Invoice");
const AppError = require("../utils/appErrors");
const {
  sendStartMovingEmail,
  sendCompletedEmail,
} = require("./emailService");

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

const findStaffDispatchByInvoice = async (invoiceId, staffId) => {
  const assignment = await DispatchAssignment.findOne({
    invoiceId,
    $or: [
      { "assignments.driverIds": staffId },
      { "assignments.staffIds": staffId },
    ],
  });

  if (!assignment) {
    throw new AppError("Không tìm thấy phân công cho đơn hàng này.", 404);
  }

  return assignment;
};

const getPersonalAssignments = (dispatchAssignment, staffId) =>
  dispatchAssignment.assignments.filter(
    (item) =>
      hasMemberId(item.driverIds, staffId) || hasMemberId(item.staffIds, staffId),
  );

const getCustomerEmailFromInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId)
    .select("_id code status customerId requestTicketId timeline")
    .populate({ path: "customerId", select: "email" })
    .populate({
      path: "requestTicketId",
      select: "customerId",
      populate: {
        path: "customerId",
        select: "email",
      },
    });

  if (!invoice) {
    throw new AppError("Không tìm thấy đơn hàng.", 404);
  }

  const customerEmail =
    invoice?.customerId?.email || invoice?.requestTicketId?.customerId?.email || "";

  return {
    invoice,
    customerEmail,
    orderId: invoice.code || String(invoice._id),
  };
};

const appendInvoiceTimeline = (invoice, status, staffId, notes) => {
  invoice.timeline = Array.isArray(invoice.timeline) ? invoice.timeline : [];
  invoice.timeline.push({
    status,
    updatedBy: staffId,
    updatedAt: new Date(),
    notes,
  });
};

const startOrderByStaff = async ({ invoiceId, staffId }) => {
  const dispatchAssignment = await findStaffDispatchByInvoice(invoiceId, staffId);
  const personalAssignments = getPersonalAssignments(dispatchAssignment, staffId);

  if (!personalAssignments.length) {
    throw new AppError("Bạn không được phân công cho đơn hàng này.", 403);
  }

  const startedAt = new Date();
  personalAssignments.forEach((item) => {
    item.status = "IN_PROGRESS";
    if (!item.confirmedAt) {
      item.confirmedAt = startedAt;
    }
  });

  dispatchAssignment.status = "IN_DISPATCH";

  // Gate: Prevent starting if understaffed and customer hasn't approved
  const invoiceDoc = await Invoice.findById(invoiceId);
  if (dispatchAssignment.understaffed && invoiceDoc.understaffedApproval !== 'ACCEPT') {
    throw new AppError("Đơn hàng này đang chờ khách hàng phê duyệt do thiếu nhân sự hoặc xung đột lịch trình.", 400);
  }

  await dispatchAssignment.save();

  const { invoice, customerEmail, orderId } = await getCustomerEmailFromInvoice(
    invoiceId,
  );

  invoice.status = "IN_PROGRESS";
  appendInvoiceTimeline(
    invoice,
    "IN_PROGRESS",
    staffId,
    "Staff bắt đầu thực hiện đơn hàng",
  );
  await invoice.save();

  const emailResult = await sendStartMovingEmail(customerEmail, orderId, startedAt);

  return {
    orderId,
    status: invoice.status,
    startedAt,
    customerEmail,
    emailSent: Boolean(emailResult?.success),
    emailInfo: emailResult,
  };
};

const completeOrderByStaff = async ({ invoiceId, staffId }) => {
  const dispatchAssignment = await findStaffDispatchByInvoice(invoiceId, staffId);
  const personalAssignments = getPersonalAssignments(dispatchAssignment, staffId);

  if (!personalAssignments.length) {
    throw new AppError("Bạn không được phân công cho đơn hàng này.", 403);
  }

  const completedAt = new Date();
  personalAssignments.forEach((item) => {
    item.status = "COMPLETED";
    item.completedAt = completedAt;
  });

  const allCompleted = dispatchAssignment.assignments.every(
    (item) => item.status === "COMPLETED",
  );

  dispatchAssignment.status = allCompleted ? "COMPLETED" : "IN_DISPATCH";
  await dispatchAssignment.save();

  const { invoice, customerEmail, orderId } = await getCustomerEmailFromInvoice(
    invoiceId,
  );

  // Requirement: mark order as COMPLETED on complete endpoint.
  invoice.status = "COMPLETED";
  appendInvoiceTimeline(
    invoice,
    "COMPLETED",
    staffId,
    "Staff hoàn tất đơn hàng",
  );
  await invoice.save();

  const emailResult = await sendCompletedEmail(
    customerEmail,
    orderId,
    completedAt,
  );

  return {
    orderId,
    status: invoice.status,
    completedAt,
    customerEmail,
    allAssignmentsCompleted: allCompleted,
    emailSent: Boolean(emailResult?.success),
    emailInfo: emailResult,
  };
};

module.exports = {
  startOrderByStaff,
  completeOrderByStaff,
};
