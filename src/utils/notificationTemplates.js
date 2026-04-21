/**
 * notificationTemplates.js
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for ALL system notification content.
 *
 * Every export is a pure factory function:
 *   (params?) => { title: String, message: String, type: String }
 *
 * Notification types accepted by NotificationService:
 *   'System' | 'Assignment' | 'WARNING' | 'account'
 *
 * Usage:
 *   const T = require('../utils/notificationTemplates');
 *   await NotificationService.createNotification({
 *     userId,
 *     ...T.SURVEY_SCHEDULED({ scheduledDate: '10:00 15/05/2026' }),
 *     ticketId: ticket._id
 *   }, io);
 * ─────────────────────────────────────────────────────────────
 */

/* ── Survey lifecycle ─────────────────────────────────────── */

/**
 * Customer is notified that their survey has been scheduled.
 * @param {{ scheduledDate: string }} params
 */
exports.SURVEY_SCHEDULED = ({ scheduledDate }) => ({
  title: 'Lịch khảo sát đã được xác nhận',
  message: `Khảo sát được lên lịch vào ${scheduledDate}`,
  type: 'System',
});

/**
 * Dispatcher proposes a new survey time to the customer.
 */
exports.DISPATCHER_PROPOSES_RESCHEDULE = () => ({
  title: 'Điều phối viên đề xuất đổi lịch khảo sát',
  message: 'Điều phối viên đã đề xuất thời gian khảo sát mới cho đơn của bạn',
  type: 'System',
});

/**
 * Dispatcher is notified that the customer accepted the scheduled survey time.
 * @param {{ selectedTime: string, ticketCode: string }} params
 */
exports.CUSTOMER_ACCEPTED_SURVEY_TIME = ({ selectedTime, ticketCode }) => ({
  title: 'Lịch khảo sát được chấp nhận',
  message: `Khách hàng đã chấp nhận lịch khảo sát: ${selectedTime} cho đơn ${ticketCode}`,
  type: 'System',
});

/**
 * Head dispatchers are notified when a customer rejects the survey time.
 * @param {{ ticketCode: string, reason: string }} params
 */
exports.CUSTOMER_REJECTED_SURVEY_TIME = ({ ticketCode, reason }) => ({
  title: 'Khách hàng yêu cầu đổi giờ khảo sát',
  message: `Đơn ${ticketCode} đã được khách hàng yêu cầu đổi lịch: ${reason}`,
  type: 'System',
});

/**
 * Customer is notified that the dispatcher confirmed the time they proposed.
 * @param {{ selectedTime: string }} params
 */
exports.DISPATCHER_CONFIRMED_SURVEY_TIME = ({ selectedTime }) => ({
  title: 'Lịch khảo sát đã được thống nhất',
  message: `Điều phối viên đã chấp nhận giờ khảo sát bạn đề xuất: ${selectedTime}`,
  type: 'System',
});

/* ── Ticket approval / assignment ───────────────────────────── */

/**
 * Customer notified their FULL_HOUSE order is confirmed and survey is pending.
 */
exports.ORDER_CONFIRMED_SURVEY_PENDING = () => ({
  title: 'Đơn hàng của bạn đã được xác nhận',
  message: 'Nhân viên khảo sát đã được phân công. Vui lòng chờ lịch hẹn khảo sát.',
  type: 'System',
});

/**
 * Head dispatchers are notified that auto-assignment failed for a FULL_HOUSE survey.
 * @param {{ ticketCode: string }} params
 */
exports.AUTO_ASSIGNMENT_FAILED_SURVEY = ({ ticketCode }) => ({
  title: `Phân công tự động thất bại — Đơn #${ticketCode}`,
  message: 'Tất cả nhân viên khảo sát đang quá tải. Vui lòng phân công thủ công.',
  type: 'System',
});

/**
 * Customer notified their SPECIFIC_ITEMS / ITEM_MOVING order is accepted.
 */
exports.ORDER_ACCEPTED_ITEM_MOVING = () => ({
  title: 'Đơn hàng đã được tiếp nhận',
  message: 'Yêu cầu của bạn đã được xác nhận và đang được xử lý bởi nhân viên điều phối.',
  type: 'System',
});

/**
 * Head dispatchers notified that auto-assignment failed for ITEM_MOVING.
 * @param {{ ticketCode: string }} params
 */
exports.AUTO_ASSIGNMENT_FAILED_ITEM_MOVING = ({ ticketCode }) => ({
  title: `Phân công tự động thất bại — Đơn #${ticketCode}`,
  message: 'Tất cả nhân viên điều phối đang quá tải. Vui lòng phân công thủ công.',
  type: 'System',
});

/**
 * Customer notified their TRUCK_RENTAL order is accepted; quote coming soon.
 */
exports.ORDER_ACCEPTED_TRUCK_RENTAL = () => ({
  title: 'Đơn hàng đã được tiếp nhận',
  message: 'Yêu cầu của bạn đã được xác nhận. Chúng tôi sẽ sớm gửi báo giá chi tiết.',
  type: 'System',
});

/* ── Dispatch operations ──────────────────────────────────── */

/**
 * Assigned drivers/leaders are notified of a new job.
 * @param {{ requestCode?: string }} params
 */
exports.DRIVER_NEW_ASSIGNMENT = ({ requestCode } = {}) => ({
  title: 'Bạn có yêu cầu mới được phân công',
  message: requestCode
    ? `Bạn vừa được phân công yêu cầu ${requestCode}. Vui lòng kiểm tra chi tiết để thực hiện.`
    : 'Bạn vừa được phân công một yêu cầu mới. Vui lòng kiểm tra chi tiết để thực hiện.',
  type: 'Assignment',
});

/**
 * Customer warned when their order will be dispatched with fewer staff than planned.
 */
exports.DISPATCH_UNDERSTAFFED = () => ({
  title: 'Thông báo về nhân sự đơn hàng',
  message:
    'Đơn hàng của bạn đã được điều phối nhưng có thể thiếu nhân sự so với dự kiến. Vui lòng thông cảm hoặc liên hệ tổng đài.',
  type: 'WARNING',
});

/**
 * [SCENARIO A] Customer notified that dispatch is successfully assigned.
 * @param {{ ticketCode: string, dispatchTime: string, vehicleCount: number }} params
 */
exports.DISPATCH_SUCCESS = ({ ticketCode, dispatchTime, vehicleCount }) => ({
  title: 'Đơn hàng đã được điều phối thành công',
  message: `Đơn hàng #${ticketCode} đã được điều phối với ${vehicleCount} xe vào lúc ${dispatchTime}. Đội ngũ sẽ liên hệ trước khi đến.`,
  type: 'Assignment',
});

/**
 * [SCENARIO B] Customer notified that the dispatcher has proposed a new dispatch time.
 * The original scheduled time is NOT changed until customer accepts.
 * @param {{ ticketCode: string, proposedTime: string }} params
 */
exports.DISPATCH_RESCHEDULE_PROPOSED = ({ ticketCode, proposedTime }) => ({
  title: 'Đề xuất thay đổi lịch vận chuyển',
  message: `Đơn #${ticketCode}: Điều phối viên đề xuất dời lịch vận chuyển sang ${proposedTime}. Vui lòng vào ứng dụng để xác nhận hoặc từ chối.`,
  type: 'System',
});

/**
 * Customer notified that they have accepted the proposed dispatch reschedule.
 * @param {{ ticketCode: string, confirmedTime: string }} params
 */
exports.DISPATCH_RESCHEDULE_ACCEPTED = ({ ticketCode, confirmedTime }) => ({
  title: 'Lịch vận chuyển đã được xác nhận',
  message: `Đơn hàng #${ticketCode} sẽ được thực hiện vào lúc ${confirmedTime}. Cảm ơn bạn đã xác nhận.`,
  type: 'System',
});

/**
 * Dispatcher notified when the customer rejects the proposed dispatch time change.
 * @param {{ ticketCode: string }} params
 */
exports.DISPATCH_RESCHEDULE_REJECTED = ({ ticketCode }) => ({
  title: 'Khách hàng từ chối thay đổi lịch vận chuyển',
  message: `Khách hàng đã từ chối đề xuất dời lịch cho đơn hàng #${ticketCode}. Vui lòng xem lại kế hoạch điều phối.`,
  type: 'System',
});

/**
 * Dispatcher notified when the customer accepts the proposed dispatch time change.
 * @param {{ ticketCode: string, confirmedTime: string }} params
 */
exports.DISPATCH_RESCHEDULE_ACCEPTED_BY_CUSTOMER = ({ ticketCode, confirmedTime }) => ({
  title: 'Khách hàng đã xác nhận lịch vận chuyển mới',
  message: `Khách hàng đã đồng ý dời lịch vận chuyển cho đơn hàng #${ticketCode} sang ${confirmedTime}. Kế hoạch điều phối đã được chốt.`,
  type: 'System',
});

/* ── User account management ─────────────────────────────── */

/**
 * User notified that their account was banned.
 * @param {{ reason?: string }} params
 */
exports.USER_BANNED = ({ reason } = {}) => ({
  title: 'Tài khoản bị cấm',
  message: reason
    ? `Tài khoản của bạn đã bị cấm: ${reason}`
    : 'Tài khoản của bạn đã bị cấm bởi quản trị viên.',
  type: 'account',
});

/**
 * User notified that their account ban was lifted.
 */
exports.USER_UNBANNED = () => ({
  title: 'Tài khoản đã được kích hoạt',
  message: 'Tài khoản của bạn đã được gỡ cấm và hoạt động trở lại.',
  type: 'account',
});

/* ── Contracts & payments ────────────────────────────────── */

/**
 * Customer notified when their contract is auto-cancelled due to missed deposit.
 * @param {{ contractNumber: string, depositDeadlineHours: number }} params
 */
exports.CONTRACT_AUTO_CANCELLED = ({ contractNumber, depositDeadlineHours }) => ({
  title: '⚠️ Đơn hàng đã bị hủy tự động',
  message: `Hợp đồng ${contractNumber} đã bị hủy do bạn không đặt cọc trong ${depositDeadlineHours || 48} giờ sau khi ký.`,
  type: 'System',
});
