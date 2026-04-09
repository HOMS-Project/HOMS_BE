// jobs/contractDepositExpiry.js
const cron = require('node-cron');
const Contract = require('../models/Contract');
const RequestTicket = require('../models/RequestTicket');
const Invoice = require('../models/Invoice');
const NotificationService = require('../services/notificationService');
const { getIo } = require('../utils/socket');

/**
 * Chạy mỗi 15 phút — tự hủy các order đã ký nhưng quá hạn chưa cọc
 */
function startContractDepositExpiryJob() {
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();

      // Tìm contract SIGNED + quá deadline + invoice chưa thanh toán
      const expiredContracts = await Contract.find({
        status:          'SIGNED',
        depositDeadline: { $lt: now }
      }).populate('requestTicketId', 'status invoice');

      if (expiredContracts.length === 0) return;

      console.log(`[ContractExpiry] Found ${expiredContracts.length} expired contracts`);

      for (const contract of expiredContracts) {
        try {
          // Kiểm tra invoice — nếu đã cọc rồi thì bỏ qua
          const invoice = await Invoice.findOne({
            requestTicketId: contract.requestTicketId
          });

          if (invoice && ['PARTIAL', 'PAID'].includes(invoice.paymentStatus)) {
            // Đã cọc — xóa deadline để không check lại
            contract.depositDeadline = null;
            await contract.save();
            continue;
          }

          // ── Hủy contract ──────────────────────────────────
          contract.status = 'CANCELLED';
          contract.notes  = (contract.notes || '') + ` | Tự động hủy: quá hạn đặt cọc ${new Date(contract.depositDeadline).toLocaleString('vi-VN')}`;
          await contract.save();

          // ── Hủy RequestTicket ─────────────────────────────
          const ticket = await RequestTicket.findById(contract.requestTicketId);
          if (ticket && !['CANCELLED', 'COMPLETED'].includes(ticket.status)) {
            ticket.status = 'CANCELLED';
            ticket.notes  = (ticket.notes || '') + ' | Tự động hủy do không đặt cọc đúng hạn.';
            await ticket.save();
          }

          // ── Hủy Invoice nếu có ────────────────────────────
          if (invoice && invoice.status !== 'CANCELLED') {
            invoice.status = 'CANCELLED';
            await invoice.save();
          }

          // ── Thông báo cho khách ────────────────────────────
          const io = getIo();
          await NotificationService.createNotification({
            userId:   contract.customerId,
            title:    '⚠️ Đơn hàng đã bị hủy tự động',
            message:  `Hợp đồng ${contract.contractNumber} đã bị hủy do bạn không đặt cọc trong ${contract.depositDeadlineHours || 48} giờ sau khi ký.`,
            type:     'System',
            ticketId: contract.requestTicketId
          }, io);

          console.log(`[ContractExpiry] Cancelled contract ${contract.contractNumber}`);
        } catch (innerErr) {
          console.error(`[ContractExpiry] Error processing contract ${contract._id}:`, innerErr.message);
        }
      }
    } catch (err) {
      console.error('[ContractExpiry] Cron error:', err.message);
    }
  });

  console.log('✅ ContractDepositExpiry cron started (every 1h)');
}

module.exports = { startContractDepositExpiryJob };