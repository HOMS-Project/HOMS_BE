const Contract = require('../models/Contract');
const InvoiceService = require('../services/invoiceService');
const adminContractService = require('../services/admin/contractService');
const ContractService = require('../services/admin/contractService')
const { sendOtp, verifyOtp } = require('../services/otpService');
exports.getContractByTicket = async (req, res, next) => {
    try {
        const { ticketId } = req.params;
        const customerId = req.user.userId || req.user._id || req.user.id;
        
        const contract = await Contract.findOne({ requestTicketId: ticketId, customerId: customerId });
        
        if (!contract) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng nào cho yêu cầu này' });
        }
        res.status(200).json({ success: true, data: contract });
    } catch (error) {
        next(error);
    }
};

exports.createContract = async (req, res, next) => {
    try {
        const { requestTicketId, customerId, status, terms, startDate, endDate } = req.body;
        
        // Kiểm tra contract đã tồn tại chưa
        const existingContract = await Contract.findOne({ requestTicketId });
        if (existingContract) {
            return res.status(400).json({ success: false, message: 'Hợp đồng cho yêu cầu này đã tồn tại' });
        }
        
        const newContract = new Contract({
            requestTicketId,
            customerId: customerId || req.user.userId || req.user._id || req.user.id,
            status: status || 'pending',
            terms,
            startDate,
            endDate,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        
        const savedContract = await newContract.save();
        res.status(201).json({ success: true, data: savedContract });
    } catch (error) {
        next(error);
    }
};

exports.updateContract = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        const contract = await Contract.findByIdAndUpdate(
            id,
            { ...updateData, updatedAt: new Date() },
            { new: true, runValidators: true }
        );
        
        if (!contract) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy hợp đồng' });
        }
        
        res.status(200).json({ success: true, data: contract });
    } catch (error) {
        next(error);
    }
};

exports.signContractCustomer = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        // Gọi service ký hợp đồng chung (Admin cũng dùng hàm này nhưng xử lý khác role)
        const contract = await adminContractService.signContract(id, req.body, req.user);
        
        // Sau khi Khách Hàng ký xong, tiến hành sinh hoá đơn (Invoice) từ RequestTicket
        if (contract) {
            await InvoiceService.createInvoiceFromTicket(contract.requestTicketId);
        }
        
        res.status(200).json({ success: true, data: contract });
    } catch (error) {
        if (error.message === 'Contract not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message === 'Contract is already signed') {
            return res.status(400).json({ success: false, message: error.message });
        }
        next(error);
    }
};
exports.getMyContracts = async (req, res, next) => {
    try {
        // customerId LUÔN từ token — không bao giờ từ query/body (chống IDOR)
        const customerId = req.user.userId || req.user._id;
        const { page = 1, limit = 10, status, search } = req.query;
 
        const result = await ContractService.getMyContracts(customerId, {
            page,
            limit,
            status,
            search,
        });
 
        return res.status(200).json({
            success: true,
            data: result.contracts,
            pagination: result.pagination,
            stats: result.stats,
        });
    } catch (err) {
        next(err);
    }
};
 
// ─── NEW: Lấy chi tiết một hợp đồng (chỉ của customer đang đăng nhập) ────────
 
exports.getContractDetail = async (req, res, next) => {
    try {
        const customerId = req.user.userId || req.user._id;
        const { contractId } = req.params;
 
        const contract = await ContractService.getContractDetail(contractId, customerId);
 
        return res.status(200).json({ success: true, data: contract });
    } catch (err) {
        const status = err.statusCode || 500;
        return res.status(status).json({
            success: false,
            message: err.message || 'Lỗi máy chủ, vui lòng thử lại.',
        });
    }
};
 
// ─── NEW: Tải xuống hợp đồng dạng HTML hoặc DOCX ─────────────────────────────
 
exports.downloadContract = async (req, res, next) => {
  try {
    const customerId = req.user.userId || req.user._id;
    const { contractId } = req.params;
    const { format = 'html' } = req.query;
 
    // Bảo mật: kiểm tra quyền trước
    await ContractService.getContractDetail(contractId, customerId);
 
    if (format === 'docx') {
      const { filename, buffer } = await ContractService.getContractDocx(contractId);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', buildContentDisposition(filename));
      return res.send(buffer);
    }
 
    if (format === 'pdf') {
      const { filename, buffer } = await ContractService.getContractPdf(contractId);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', buildContentDisposition(filename));
      return res.send(buffer);
    }
 
    // Mặc định: HTML
    const { filename, html } = await ContractService.getContractFile(contractId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    return res.send(html);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'Lỗi khi tải hợp đồng.',
    });
  }
};
exports.requestSignOtp = async (req, res, next) => {
  try {
    const result = await ContractService.requestSignOtp(req.params.id);

    res.json({
      success: true,
      message: result.message,
      expiresAt: result.expiresAt
    });
  } catch (err) {
    next(err);
  }
};

exports.signContract = async (req, res, next) => {
  try {
    const result = await ContractService.signContracts(
      req.params.id,
      req.body
    );

    res.json({
      success: true,
      message: result.message
    });
  } catch (err) {
    next(err);
  }
};

function buildContentDisposition(filename) {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`;
}