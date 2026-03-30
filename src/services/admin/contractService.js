const Contract = require('../../models/Contract');
const ContractTemplate = require('../../models/ContractTemplate');
const RequestTicket = require('../../models/RequestTicket');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const path = require('path');
const mongoose = require('mongoose');
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
 * Lấy một template theo id
 */
exports.getTemplateById = async (id) => {
  return await ContractTemplate.findById(id);
};

/**
 * Cập nhật template theo id
 */
exports.updateTemplate = async (id, updateData, adminId) => {
  const tpl = await ContractTemplate.findById(id);
  if (!tpl) throw new Error('Template not found');

  // Prevent changing unique name to something empty
  if (updateData.name === '' || updateData.name === null) {
    throw new Error('Invalid template name');
  }

  const updated = await ContractTemplate.findByIdAndUpdate(
    id,
    { ...updateData, updatedAt: new Date() },
    { new: true, runValidators: true }
  );
  return updated;
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
  // Support simple filters and optional pagination
  // Acceptable query params: page, limit, status, contractNumber, customerId, requestTicketId
  const { page, limit, contractNumber, status, customerId, requestTicketId, ...rest } = query || {};

  const mongoQuery = { ...rest };

  if (status) mongoQuery.status = status;
  if (contractNumber) mongoQuery.contractNumber = new RegExp(contractNumber, 'i');
  if (customerId) mongoQuery.customerId = customerId;
  if (requestTicketId) mongoQuery.requestTicketId = requestTicketId;

  const baseQuery = Contract.find(mongoQuery)
    .populate('customerId', 'fullName email phone')
    .populate('requestTicketId', 'status serviceType scheduledTime')
    .populate('templateId', 'title')
    .sort({ createdAt: -1 });

  // If pagination params provided, return a paginated object
  if (page && limit) {
    const p = parseInt(page, 10) || 1;
    const l = parseInt(limit, 10) || 20;
    const total = await Contract.countDocuments(mongoQuery);
    const data = await baseQuery.skip((p - 1) * l).limit(l).exec();
    return { data, total, page: p, limit: l };
  }

  // Default: return full array (backwards compatible)
  return await baseQuery.exec();
};

/**
 * Lấy một hợp đồng theo id (dùng cho chi tiết)
 */
exports.getContractById = async (id) => {
  return await Contract.findById(id)
    .populate('customerId', 'fullName email phone')
    .populate('requestTicketId')
    .populate('templateId', 'title content');
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

/**
 * Tạo nội dung file hợp đồng để download (HTML)
 */
exports.getContractFile = async (contractId) => {
  const contract = await Contract.findById(contractId)
    .populate('customerId', 'fullName email phone')
    .populate('requestTicketId')
    .populate('templateId', 'title');
  if (!contract) throw new Error('Contract not found');

  // Build a simple, clean HTML wrapper for the contract content
  const title = contract.templateId?.title || 'Hợp đồng';
  const contractNumber = contract.contractNumber || contract._id;
  const customerName = contract.customerId?.fullName || '';
  const createdAt = contract.createdAt ? contract.createdAt.toISOString().slice(0,10) : '';

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} - ${contractNumber}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color:#222; line-height:1.5; padding:20px }
    .header { text-align:center; margin-bottom:18px }
    .meta { margin-bottom:12px; background:#f8f8f8; padding:10px; border-radius:6px }
    .content { margin-top:12px }
  </style>
</head>
<body>
  <div class="header">
    <h2>${title}</h2>
    <div><strong>Mã hợp đồng:</strong> ${contractNumber}</div>
  </div>
  <div class="meta">
    <div><strong>Khách hàng:</strong> ${customerName}</div>
    <div><strong>Ngày tạo:</strong> ${createdAt}</div>
  </div>
  <div class="content">
    ${contract.content || '<p>(Không có nội dung)</p>'}
  </div>
  <hr />
  <div style="margin-top:18px">
    <div><strong>Trạng thái:</strong> ${contract.status || ''}</div>
  </div>
  
</body>
</html>`;

  const filename = `${(contractNumber || 'contract').toString().replace(/\s+/g,'_')}.html`;
  return { filename, html };
};

/**
 * Trả về buffer file .docx được chuyển từ HTML (yêu cầu package html-docx-js)
 */
exports.getContractDocx = async (contractId) => {
  const { filename, html } = await exports.getContractFile(contractId);
  // ensure dependency available
  let htmlDocx;
  try {
    htmlDocx = require('html-docx-js');
  } catch (err) {
    throw new Error('Dependency missing: please install html-docx-js in backend (npm install html-docx-js)');
  }

  // html-docx-js exposes asBlob/asBuffer depending on version
  let docxBuffer;
  if (typeof htmlDocx.asBuffer === 'function') {
    // asBuffer usually returns a Buffer synchronously
    docxBuffer = htmlDocx.asBuffer(html);
  } else if (typeof htmlDocx.asBlob === 'function') {
    // asBlob may return a Blob-like object; handle async arrayBuffer if present
    const blob = htmlDocx.asBlob(html);
    if (blob && typeof blob.arrayBuffer === 'function') {
      const ab = await blob.arrayBuffer();
      docxBuffer = Buffer.from(ab);
    } else if (blob && blob._buffer) {
      // some versions may attach internal buffer
      docxBuffer = Buffer.from(blob._buffer);
    } else {
      // fallback: convert returned value to string then buffer
      docxBuffer = Buffer.from(String(blob));
    }
  } else if (typeof htmlDocx === 'function') {
    const out = htmlDocx(html);
    docxBuffer = Buffer.isBuffer(out) ? out : Buffer.from(String(out));
  } else {
    throw new Error('html-docx-js did not expose a usable API (asBuffer/asBlob/function)');
  }

  const outFilename = (filename || 'contract') .toString().replace(/\.html?$/i, '') + '.docx';
  return { filename: outFilename, buffer: docxBuffer };
};
exports.getMyContracts = async (customerId, options = {}) => {
  const { page = 1, limit = 10, status, search } = options;
  const skip = (page - 1) * limit;

  const filter = { customerId };

  if (status && ['DRAFT', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED'].includes(status)) {
    filter.status = status;
  }

  if (search?.trim()) {
    filter.contractNumber = { $regex: search.trim(), $options: 'i' };
  }
 const statsAgg = await Contract.aggregate([
    { $match: { customerId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const stats = { total: 0, signed: 0, pending: 0, expired: 0 };
  statsAgg.forEach(({ _id, count }) => {
    stats.total += count;
    if (_id === 'SIGNED')               stats.signed  = count;
    if (_id === 'SENT' || _id === 'DRAFT') stats.pending += count;
    if (_id === 'EXPIRED')              stats.expired = count;
  });

  const [contracts, total] = await Promise.all([
    Contract.find(filter)
      .select('-content')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('templateId', 'title')
      .populate('requestTicketId', 'ticketNumber')
      .lean(),
    Contract.countDocuments(filter),
  ]);

  return {
    contracts,
    pagination: { total, page: Number(page), limit: Number(limit) },
      stats, 
  };
};


 exports.getContractDetail = async (contractId, customerId) => {
  const contract = await Contract.findOne({
    _id: contractId,
    customerId
  })
    .populate('templateId', 'title description')
    .populate('requestTicketId', 'ticketNumber createdAt')
    .populate('adminSignature.signedBy', 'fullName email')
    .lean();

  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng hoặc bạn không có quyền truy cập');
    err.statusCode = 404;
    throw err;
  }

  return contract;
};

 function htmlToPlainText(html = '') {
  return html
    .replace(/<\/?(p|div|section|article|header|footer|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, inner) =>
      '\n' + inner.replace(/<[^>]+>/g, '').toUpperCase() + '\n')
    .replace(/<li[^>]*>/gi, '\n  • ')
    .replace(/<\/li>/gi, '')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n─────────────────────────────────────\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}