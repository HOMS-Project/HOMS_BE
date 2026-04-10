const Contract = require('../../models/Contract');
const ContractTemplate = require('../../models/ContractTemplate');
const RequestTicket = require('../../models/RequestTicket');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const path = require('path');
const mongoose = require('mongoose');
const { sendOtp, verifyOtp } = require('../otpService');
const AppError = require('../../utils/appErrors')
const { encryptContract } = require('../../utils/contractEncryption');
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

  // If the template provides an admin signature image, copy it to the new contract
  // and treat it as an existing admin-side signature. This means the contract is
  // considered signed by admin already (so its status will reflect one-side-signed)
  // — when the customer signs later the contract will become fully SIGNED.
  if (template.adminSignature && (template.adminSignature.signatureImage || template.adminSignature.signatureImageThumb)) {
    newContract.adminSignature = {
      signatureImage: template.adminSignature.signatureImage || template.adminSignature.signatureImageThumb,
      signatureImageThumb: template.adminSignature.signatureImageThumb || undefined,
      signedByName: template.adminSignature.signedByName || 'HOMS Vận Chuyển',
      // Use template signedAt when available, otherwise mark as now to indicate admin-side signature exists
      signedAt: template.adminSignature.signedAt || new Date()
    };
    // since admin side is already (virtually) signed, mark contract as one-side-signed
    newContract.status = 'SENT';
  }

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
    // include template's adminSignature so we can fallback to it for display when contract lacks adminSignature
    .populate('templateId', 'title adminSignature')
    .sort({ createdAt: -1 });

  // If pagination params provided, return a paginated object
  if (page && limit) {
    const p = parseInt(page, 10) || 1;
    const l = parseInt(limit, 10) || 20;
    const total = await Contract.countDocuments(mongoQuery);
    let data = await baseQuery.skip((p - 1) * l).limit(l).exec();
    // normalize to plain objects and attach template adminSignature as fallback for display
    data = data.map(d => {
      const c = (typeof d.toObject === 'function') ? d.toObject() : d;
      if ((!c.adminSignature || !c.adminSignature.signatureImage) && c.templateId && c.templateId.adminSignature) {
        c.adminSignature = c.templateId.adminSignature;
      }
      return c;
    });
    return { data, total, page: p, limit: l };
  }

  // Default: return full array (backwards compatible)
  const rows = await baseQuery.exec();
  // Attach template adminSignature for each row when missing
  return rows.map(r => {
    const c = (typeof r.toObject === 'function') ? r.toObject() : r;
    if ((!c.adminSignature || !c.adminSignature.signatureImage) && c.templateId && c.templateId.adminSignature) {
      c.adminSignature = c.templateId.adminSignature;
    }
    return c;
  });
};

/**
 * Lấy một hợp đồng theo id (dùng cho chi tiết)
 */
exports.getContractById = async (id) => {
  // Populate template so we can fallback to template-level adminSignature when contract doesn't have one
  const contract = await Contract.findById(id)
    .populate('customerId', 'fullName email phone')
    .populate('requestTicketId')
    .populate('templateId')
    .lean();

  if (!contract) return null;

  // If contract lacks adminSignature image but template has one, attach it for display (do not persist)
  if ((!contract.adminSignature || !contract.adminSignature.signatureImage) && contract.templateId && contract.templateId.adminSignature) {
    contract.adminSignature = contract.templateId.adminSignature;
  }

  return contract;
};

/**
 * Cập nhật chữ ký điện tử
 */
exports.signContract = async (contractId, signData, user) => {
  // populate templateId so we can copy template.adminSignature into the contract when needed
  const contract = await Contract.findById(contractId).populate('templateId');
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
    // If adminSignature is missing on the contract but the template provides one,
    // persist the template adminSignature into the contract so it's stored permanently.
    if ((!contract.adminSignature || !contract.adminSignature.signatureImage) && contract.templateId && contract.templateId.adminSignature) {
      const tplSig = contract.templateId.adminSignature;
      contract.adminSignature = {
        signatureImage: tplSig.signatureImage || tplSig.signatureImageThumb,
        signatureImageThumb: tplSig.signatureImageThumb || undefined,
        signedByName: tplSig.signedByName || 'HOMS Vận Chuyển',
        signedAt: tplSig.signedAt || new Date()
      };
    }

    contract.customerSignature = {
      signatureImage: signData.signatureImage,
      signedAt: new Date(),
      ipAddress: signData.ipAddress
    };
  }

  // If both sides now have signatures, mark as SIGNED
  if (contract.adminSignature?.signatureImage && contract.customerSignature?.signatureImage) {
    contract.status = 'SIGNED';
  } else {
    contract.status = 'SENT'; // Only one side signed
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
    .populate('adminSignature.signedBy', 'fullName')
    .populate('templateId', 'title');
  if (!contract) throw new Error('Contract not found');

  // Build a simple, clean HTML wrapper for the contract content
  const title = contract.templateId?.title || 'Hợp đồng';
  const contractNumber = contract.contractNumber || contract._id;
  const customerName = contract.customerId?.fullName || '';
  const createdAt = contract.createdAt ? contract.createdAt.toISOString().slice(0, 10) : '';
  const customerSigBlock = contract.customerSignature?.signatureImageThumb
    ? `<img src="${contract.customerSignature.signatureImageThumb}"
            style="max-width:220px; max-height:90px; border:1px solid #ddd; border-radius:4px;" />`
    : '<div style="border-bottom:1px solid #000; width:220px; height:60px;"></div>';

  const adminSigBlock = contract.adminSignature?.signatureImage
    ? `<img src="${contract.adminSignature.signatureImage}"
            style="max-width:220px; max-height:90px; border:1px solid #ddd; border-radius:4px;" />`
    : '<div style="border-bottom:1px solid #000; width:220px; height:60px; background:#f9f9f9;"><p style="color:#aaa;font-size:12px;text-align:center;padding-top:20px;">Chờ ký</p></div>';

  const customerSignedAt = contract.customerSignature?.signedAt
    ? new Date(contract.customerSignature.signedAt).toLocaleString('vi-VN') : '—';
  const adminSignedAt = contract.adminSignature?.signedAt
    ? new Date(contract.adminSignature.signedAt).toLocaleString('vi-VN') : '—';
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title} - ${contractNumber}</title>
  <style>
    body { font-family: "Times New Roman", serif; color:#222; line-height:1.6; padding:30px; max-width:800px; margin:0 auto; }
    .header { text-align:center; margin-bottom:24px; }
    .meta { margin-bottom:16px; background:#f8f8f8; padding:12px 16px; border-radius:6px; font-size:14px; }
    .meta div { margin-bottom:4px; }
    .content { margin:20px 0; border-top:1px solid #eee; border-bottom:1px solid #eee; padding:20px 0; }
    .signature-section {
      display: flex; justify-content: space-between;
      margin-top: 48px; gap: 32px;
    }
    .sig-box {
      flex: 1; text-align: center;
      border: 1px solid #e0e0e0; border-radius: 8px;
      padding: 20px 16px;
    }
    .sig-title { font-weight: bold; font-size: 14px; margin-bottom: 12px; text-transform: uppercase; }
    .sig-name  { margin-top: 12px; font-weight: 600; font-size: 14px; }
    .sig-date  { color: #888; font-size: 12px; margin-top: 4px; }
    .hash-box  { margin-top: 32px; font-size: 11px; color: #aaa; word-break: break-all; border-top: 1px dashed #eee; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <p style="font-weight:bold;font-size:15px;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
    <p style="text-decoration:underline;font-weight:bold;">Độc lập - Tự do - Hạnh phúc</p>
    <h2 style="margin-top:16px;">${title.toUpperCase()}</h2>
    <p style="color:#666;font-style:italic;">Số: ${contractNumber}</p>
  </div>

  <div class="meta">
    <div><strong>Khách hàng (Bên B):</strong> ${customerName}</div>
    <div><strong>Ngày tạo:</strong> ${createdAt}</div>
    <div><strong>Trạng thái:</strong> ${contract.status}</div>
    ${contract.depositDeadline ? `<div><strong>Hạn đặt cọc:</strong> ${new Date(contract.depositDeadline).toLocaleString('vi-VN')}</div>` : ''}
  </div>

  <div class="content">
    ${contract.content || '<p>(Không có nội dung)</p>'}
  </div>

  <!-- ── PHẦN CHỮ KÝ ── -->
  <div class="signature-section">
    <div class="sig-box">
      <div class="sig-title">Bên A — Đại diện HOMS</div>
      ${adminSigBlock}
      <div class="sig-name">${contract.adminSignature?.signedByName || 'HOMS Vận Chuyển'}</div>
    </div>

    <div class="sig-box">
      <div class="sig-title">Bên B — Khách hàng</div>
      ${customerSigBlock}
      <div class="sig-name">${customerName}</div>
      <div class="sig-date">Ký lúc: ${customerSignedAt}</div>
    </div>
  </div>

  ${contract.contentHash ? `
  <div class="hash-box">
    🔒 Mã xác thực toàn vẹn (SHA-256): ${contract.contentHash}
  </div>` : ''}
</body>
</html>`;

  const filename = `${contractNumber.replace(/\s+/g, '_')}.html`;
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

  const outFilename = (filename || 'contract').toString().replace(/\.html?$/i, '') + '.docx';
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
    if (_id === 'SIGNED') stats.signed = count;
    if (_id === 'SENT' || _id === 'DRAFT') stats.pending += count;
    if (_id === 'EXPIRED') stats.expired = count;
  });

  const [contracts, total] = await Promise.all([
    Contract.find(filter)
      .select('-content')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('templateId', 'title adminSignature')
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
   .select('+customerSignature.signatureImage')
    // populate adminSignature on template so we can fallback to it for display if contract lacks adminSignature
    .populate('templateId', 'title description adminSignature')
    .populate('requestTicketId', 'ticketNumber createdAt')
    .populate('adminSignature.signedBy', 'fullName email')
    .lean();

  if (!contract) {
    const err = new Error('Không tìm thấy hợp đồng hoặc bạn không có quyền truy cập');
    err.statusCode = 404;
    throw err;
  }
  if ((!contract.adminSignature || !contract.adminSignature.signatureImage) && contract.templateId && contract.templateId.adminSignature) {
    contract.adminSignature = contract.templateId.adminSignature;
  }

  // If this contract doesn't include an adminSignature image (older contracts),
  // fall back to the template's adminSignature for display only (do not persist).
  if ((!contract.adminSignature || !contract.adminSignature.signatureImage) && contract.templateId && contract.templateId.adminSignature) {
    contract.adminSignature = contract.templateId.adminSignature;
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
exports.getContractPdf = async (contractId) => {
  const contract = await Contract.findById(contractId)
    .select('+customerSignature.signatureImage')
    .populate('customerId', 'fullName email phone')
    // populate template adminSignature so PDF can render admin signature even when it's stored on the template
    .populate('templateId', 'title adminSignature')
    .lean();
  if (!contract) throw new Error('Contract not found');

  // If contract doesn't include adminSignature image but template has one, attach it for PDF rendering
  if ((!contract.adminSignature || !contract.adminSignature.signatureImage) && contract.templateId && contract.templateId.adminSignature) {
    contract.adminSignature = contract.templateId.adminSignature;
  }

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve({
      filename: `contract-${(contract.contractNumber || contractId).replace(/[^\w\-]/g, '_')}.pdf`,
      buffer: Buffer.concat(buffers),
    }));
    doc.on('error', reject);

    const fontPath = path.join(__dirname, '../../fonts/Roboto-Regular.ttf');
    const fontBoldPath = path.join(__dirname, '../../fonts/Roboto-Bold.ttf');
    doc.registerFont('Roboto', fontPath);
    doc.registerFont('Roboto-Bold', fontBoldPath);
    const W = doc.page.width - 100;

    // ── Tiêu đề ─────────────────────────────────────────────
    doc.font('Roboto-Bold').fontSize(16)
      .text(contract.templateId?.title || 'HỢP ĐỒNG', { align: 'center', width: W });
    doc.moveDown(0.3);
    doc.font('Roboto').fontSize(11)
      .text(`Số: ${contract.contractNumber}`, { align: 'center', width: W });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(0.5);

    // ── Meta ─────────────────────────────────────────────────
    const metaItems = [
      ['Khách hàng (Bên B)', contract.customerId?.fullName || ''],
      ['Ngày tạo', new Date(contract.createdAt).toLocaleDateString('vi-VN')],
      ['Trạng thái', contract.status],
    ];
    if (contract.depositDeadline) {
      metaItems.push(['Hạn đặt cọc', new Date(contract.depositDeadline).toLocaleString('vi-VN')]);
    }
    metaItems.forEach(([label, val]) => {
      doc.font('Roboto-Bold').fontSize(11).text(`${label}: `, { continued: true, width: W });
      doc.font('Roboto').text(val);
    });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(1);

    // ── Nội dung ─────────────────────────────────────────────
    const plainText = htmlToPlainText(contract.content || 'Không có nội dung');
    doc.font('Roboto').fontSize(12)
      .text(plainText, { width: W, align: 'justify', lineGap: 4 });
    doc.moveDown(2);

    // ── Phần chữ ký ──────────────────────────────────────────
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown(1);
    doc.font('Roboto-Bold').fontSize(13)
      .text('CHỮ KÝ CÁC BÊN', { align: 'center', width: W });
    doc.moveDown(1);

    const sigY = doc.y;
    const leftX = 60;
    const rightX = doc.page.width / 2 + 20;
    const boxW = doc.page.width / 2 - 80;

    // Bên A
    doc.font('Roboto-Bold').fontSize(11)
      .text('BÊN A — ĐẠI DIỆN HOMS', leftX, sigY, { width: boxW, align: 'center' });

    // Bên B
    doc.font('Roboto-Bold').fontSize(11)
      .text('BÊN B — KHÁCH HÀNG', rightX, sigY, { width: boxW, align: 'center' });

    doc.moveDown(0.5);
    const imgY = doc.y;

    // Chèn ảnh chữ ký nếu có
    const tryEmbedSignature = (base64Img, x, y, w) => {
      if (!base64Img) {
        // Vẽ ô trống
        doc.rect(x, y, w, 70).stroke();
        doc.font('Roboto').fontSize(10)
          .fillColor('#aaa')
          .text('(Chưa ký)', x, y + 28, { width: w, align: 'center' });
        doc.fillColor('#000');
        return;
      }
      try {
        // Tách phần data từ base64 data URL
        const base64Data = base64Img.includes(',') ? base64Img.split(',')[1] : base64Img;
        const imgBuffer = Buffer.from(base64Data, 'base64');
        doc.image(imgBuffer, x, y, { width: w, height: 70, fit: [w, 70] });
      } catch {
        doc.rect(x, y, w, 70).stroke();
      }
    };
    const customerSig =
      contract.customerSignature?.signatureImageThumb ||
      contract.customerSignature?.signatureImage;
    tryEmbedSignature(contract.adminSignature?.signatureImage, leftX, imgY, boxW);
    tryEmbedSignature(customerSig, rightX, imgY, boxW);
   // move cursor below signature images
   doc.y = imgY + 80;

   // Tên + ngày ký (only render customer's signed time)
   const customerSignedAt = contract.customerSignature?.signedAt
    ? new Date(contract.customerSignature.signedAt).toLocaleString('vi-VN') : '—';

   // Use explicit Y positions to avoid overlapping text when rendered into PDF
   const nameY = doc.y + 6;       // space between image and names
   const signedAtY = nameY + 16;  // space between name and signedAt

   doc.font('Roboto-Bold').fontSize(10)
     .text(contract.adminSignature?.signedByName || 'HOMS Vận Chuyển', leftX, nameY, { width: boxW, align: 'center' });

   doc.font('Roboto-Bold').fontSize(10)
     .text(contract.customerId?.fullName || '', rightX, nameY, { width: boxW, align: 'center' });

   // customer's signed time sits below their name
   doc.font('Roboto').fontSize(9)
     .text(`Ký lúc: ${customerSignedAt}`, rightX, signedAtY, { width: boxW, align: 'center' });

   // advance doc.y past the signature block
   doc.y = signedAtY + 18;
   doc.fillColor('#000');

    // ── Hash xác thực ─────────────────────────────────────────
    if (contract.contentHash) {
      doc.moveDown(2);
      doc.font('Roboto').fontSize(8).fillColor('#bbb')
        .text(`Mã xác thực (SHA-256): ${contract.contentHash}`, 50, doc.y, { width: W, align: 'center' });
    }

    doc.end();
  });
};
exports.requestSignOtp = async (contractId) => {
  const contract = await Contract.findById(contractId)
    .populate('customerId', 'fullName email')
    .populate('templateId');

  if (!contract) {
    throw new AppError('Hợp đồng không tồn tại', 404);
  }

  if (!['DRAFT', 'SENT'].includes(contract.status)) {
    throw new AppError('Hợp đồng không ở trạng thái có thể ký', 400);
  }

  const { email, fullName } = contract.customerId;

  const { expiresAt } = await sendOtp(
    'CONTRACT_SIGN',
    contract._id.toString(),
    email,
    fullName
  );

  return {
    message: `Mã OTP đã gửi đến ${email}`,
    expiresAt
  };
};

exports.signContracts = async (contractId, data) => {
  const { signatureImage, otp, ipAddress } = data;

  if (!signatureImage) {
    throw new AppError('Thiếu chữ ký', 400);
  }

  if (!otp) {
    throw new AppError('Thiếu mã OTP', 400);
  }

  const contract = await Contract.findById(contractId)
    .populate('customerId', 'fullName email')
    .populate('templateId');

  if (!contract) {
    throw new AppError('Hợp đồng không tồn tại', 404);
  }
  if (contract.status === 'SIGNED') {
    throw new AppError('Hợp đồng đã được ký trước đó', 400);
  }


  try {
    await verifyOtp('CONTRACT_SIGN', contract._id.toString(), otp);
  } catch (err) {
    throw new AppError(err.message, 400);
  }
  const signedAt = new Date();
  const contentHash = require('crypto')
    .createHash('sha256')
    .update(contract.content)
    .digest('hex');
  const signedPayload = JSON.stringify({
    contractNumber: contract.contractNumber,
    content: contract.content,
    signatureImage,
    signedAt: signedAt.toISOString(),
    ipAddress: ipAddress || 'unknown',
    signerName: contract.customerId?.fullName,
    signerEmail: contract.customerId?.email,
    contentHash
  });
  const { encryptedData, iv, authTag } = encryptContract(signedPayload);
  const signatureImageThumb = signatureImage;
  const deadlineHours = contract.depositDeadlineHours || 48;
  const depositDeadline = new Date(signedAt.getTime() + deadlineHours * 60 * 60 * 1000);
    // If contract lacks adminSignature but template provides one, persist it into contract
    if ((!contract.adminSignature || !contract.adminSignature.signatureImage) && contract.templateId && contract.templateId.adminSignature) {
      const tplSig = contract.templateId.adminSignature;
      contract.adminSignature = {
        signatureImage: tplSig.signatureImage || tplSig.signatureImageThumb,
        signatureImageThumb: tplSig.signatureImageThumb || undefined,
        signedByName: tplSig.signedByName || 'HOMS Vận Chuyển',
        signedAt: tplSig.signedAt || new Date()
      };
    }
  contract.customerSignature = {
    signatureImage: signatureImage,
    signatureImageThumb: signatureImageThumb,
    signedAt,
    ipAddress: ipAddress || 'unknown'
  };
  contract.encryptedSignedData = encryptedData;
  contract.encryptionIv = iv;
  contract.encryptionAuthTag = authTag;
  contract.contentHash = contentHash;
  contract.depositDeadline = depositDeadline;
  contract.status = 'SIGNED';
  contract.signedAt = signedAt;
  await contract.save();
  try {
    const InvoiceService = require('../invoiceService');
    await InvoiceService.createInvoiceFromTicket(contract.requestTicketId);
    console.log(`[Contract ${contractId}] Invoice created after signing`);
  } catch (invoiceErr) {
    console.warn(`[Contract ${contractId}] Invoice creation skipped:`, invoiceErr.message);
  }
  return {
    message: 'Ký hợp đồng thành công',
    depositDeadline
  };
};