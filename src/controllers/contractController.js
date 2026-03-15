const Contract = require('../models/Contract');
const InvoiceService = require('../services/invoiceService');
const adminContractService = require('../services/admin/contractService');

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
