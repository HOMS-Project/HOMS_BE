const Contract = require('../../models/Contract');
const ContractTemplate = require('../../models/ContractTemplate');
const RequestTicket = require('../../models/RequestTicket');
const crypto = require('crypto');

/**
 * Tạo Contract Template mới
 */
exports.createTemplate = async (templateData, adminId) => {
    const newTemplate = new ContractTemplate({
        ...templateData,
        createdBy: adminId
    });
    return await newTemplate.save();
};

/**
 * Lấy danh sách Templates
 */
exports.getTemplates = async (query = {}) => {
    return await ContractTemplate.find(query).sort({ createdAt: -1 });
};

/**
 * Sinh hợp đồng từ Template cho một RequestTicket cụ thể
 */
exports.generateContract = async (data, adminId) => {
    const { templateId, requestTicketId, customerId, customData } = data;

    const template = await ContractTemplate.findById(templateId);
    if (!template) throw new Error('Template not found');

    const requestTicket = await RequestTicket.findById(requestTicketId);
    if (!requestTicket) throw new Error('Request Ticket not found');

    // Giả lập bind data vào nội dung HTML
    // Trong thực tế sẽ dùng thư viện template engine như Handlebars (handlebars.compile)
    let finalContent = template.content;

    // Replace cơ bản (demo)
    if (customData) {
        for (const [key, value] of Object.entries(customData)) {
            finalContent = finalContent.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
        }
    }

    // Tạo mã hợp đồng ngẫu nhiên
    const contractNumber = `HĐ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const newContract = new Contract({
        contractNumber,
        templateId,
        requestTicketId,
        customerId,
        content: finalContent,
        status: 'DRAFT'
    });

    return await newContract.save();
};

/**
 * Lấy danh sách Contract
 */
exports.getContracts = async (query = {}) => {
    return await Contract.find(query)
        .populate('customerId', 'fullName email phone')
        .populate('requestTicketId', 'status serviceType')
        .sort({ createdAt: -1 });
};

/**
 * Cập nhật chữ ký điện tử
 */
exports.signContract = async (contractId, signData, user) => {
    const contract = await Contract.findById(contractId);
    if (!contract) throw new Error('Contract not found');

    if (contract.status === 'SIGNED') {
        throw new Error('Contract is already signed');
    }

    if (user.role === 'admin' || user.role === 'staff') {
        contract.adminSignature = {
            signatureImage: signData.signatureImage,
            signedAt: new Date(),
            signedBy: user.id
        };
    } else { // customer
        contract.customerSignature = {
            signatureImage: signData.signatureImage,
            signedAt: new Date(),
            ipAddress: signData.ipAddress
        };
    }

    // Nếu cả 2 bên đã ký (hoặc tuỳ logic doanh nghiệp, ở đây ví dụ admin ký là SIGNED)
    if (contract.adminSignature?.signatureImage && contract.customerSignature?.signatureImage) {
        contract.status = 'SIGNED';
    } else {
        contract.status = 'SENT'; // Chỉ mới 1 bên ký
    }

    await contract.save();
    return contract;
};
