const mongoose = require('mongoose');
const Invoice = require('../../models/Invoice');

/**
 * Return detailed invoice information populated with customer, request ticket and dispatch assignment
 */
const getInvoiceById = async (id) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) throw { statusCode: 400, message: 'Invalid invoice id' };

    const invoice = await Invoice.findById(id)
      .populate('customerId', 'fullName phone email')
  // include moveType so callers can know which service (truck rental / full house / specific items)
  .populate({ path: 'requestTicketId', select: 'pickup delivery code moveType rentalDetails' })
      .populate({
        path: 'dispatchAssignmentId',
        populate: [
          { path: 'assignments.vehicleId', model: 'Vehicle', select: 'plateNumber vehicleId vehicleType' },
          { path: 'assignments.driverIds', model: 'User', select: 'fullName phone' },
          { path: 'assignments.staffIds', model: 'User', select: 'fullName phone' }
        ]
      })
      .lean();

    if (!invoice) throw { statusCode: 404, message: 'Invoice not found' };

    // Normalize output for FE consumption
    const assignedVehicles = [];
    const assignedDrivers = [];
    const assignedStaff = [];

    if (invoice.dispatchAssignmentId && Array.isArray(invoice.dispatchAssignmentId.assignments)) {
      invoice.dispatchAssignmentId.assignments.forEach((a) => {
        if (a.vehicleId) assignedVehicles.push({
          _id: a.vehicleId._id || a.vehicleId,
          plateNumber: a.vehicleId.plateNumber,
          vehicleId: a.vehicleId.vehicleId,
          vehicleType: a.vehicleId.vehicleType
        });

        if (Array.isArray(a.driverIds)) {
          a.driverIds.forEach(d => {
            if (d) assignedDrivers.push({ _id: d._id || d, fullName: d.fullName, phone: d.phone });
          });
        }

        if (Array.isArray(a.staffIds)) {
          a.staffIds.forEach(s => {
            if (s) assignedStaff.push({ _id: s._id || s, fullName: s.fullName, phone: s.phone });
          });
        }
      });
    }

    // deduplicate by _id
    const uniqById = (items) => {
      const map = new Map();
      (items || []).forEach(it => {
        const id = it && (it._id || it.id || it.vehicleId);
        if (!id) return;
        const key = typeof id === 'object' ? String(id) : String(id);
        if (!map.has(key)) map.set(key, it);
      });
      return Array.from(map.values());
    };

    // compute lastTimelineUpdatedAt from timeline (most recent timeline.updatedAt)
    // Robustness: filter out invalid dates, fall back to updatedAt then createdAt when available
    const computeLastTimeline = (inv) => {
      if (Array.isArray(inv.timeline) && inv.timeline.length) {
        const times = inv.timeline
          .map(t => t && t.updatedAt ? new Date(t.updatedAt).getTime() : NaN)
          .filter(ts => !Number.isNaN(ts));
        if (times.length) {
          const ms = Math.max(...times);
          return new Date(ms).toISOString();
        }
      }
      if (inv.updatedAt) return new Date(inv.updatedAt).toISOString();
      if (inv.createdAt) return new Date(inv.createdAt).toISOString();
      return null;
    };

    return {
      ...invoice,
      customer: invoice.customerId || null,
      pickup: invoice.requestTicketId?.pickup || null,
      delivery: invoice.requestTicketId?.delivery || null,
      // provide lastTimelineUpdatedAt for front-end to use
      lastTimelineUpdatedAt: computeLastTimeline(invoice),
      assignedVehicles: uniqById(assignedVehicles),
      assignedDrivers: uniqById(assignedDrivers),
      assignedStaff: uniqById(assignedStaff)
    };
  } catch (err) {
    console.error('invoiceService.getInvoiceById error:', err && err.message ? err.message : err);
    throw err;
  }
};

// List invoices with pagination and simple filtering
const getInvoices = async ({ page = 1, limit = 20, search = '', status } = {}) => {
  try {
    const query = {};
    if (status) {
      // support multiple statuses (array or comma-separated string)
      if (Array.isArray(status)) {
        query.status = { $in: status };
      } else if (typeof status === 'string' && status.includes(',')) {
        const arr = status.split(',').map(s => s.trim()).filter(Boolean);
        if (arr.length) query.status = { $in: arr };
      } else {
        query.status = status;
      }
    }
    if (search && String(search).trim()) {
      // simple search against invoice code, request ticket code and customer fields
      const s = String(search).trim();
      query.$or = [
        { code: { $regex: s, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('customerId', 'fullName phone email')
  .populate({ path: 'requestTicketId', select: 'pickup delivery code moveType rentalDetails' })
        .populate({
          path: 'dispatchAssignmentId',
          populate: [
            { path: 'assignments.vehicleId', model: 'Vehicle', select: 'plateNumber vehicleId vehicleType' },
            { path: 'assignments.driverIds', model: 'User', select: 'fullName phone' },
            { path: 'assignments.staffIds', model: 'User', select: 'fullName phone' }
          ]
        })
        .lean(),
      Invoice.countDocuments(query)
    ]);

    // normalize similar to getInvoiceById
    const normalize = (invoice) => {
      const assignedVehicles = [];
      const assignedDrivers = [];
      const assignedStaff = [];

      if (invoice.dispatchAssignmentId && Array.isArray(invoice.dispatchAssignmentId.assignments)) {
        invoice.dispatchAssignmentId.assignments.forEach((a) => {
          if (a.vehicleId) assignedVehicles.push({
            _id: a.vehicleId._id || a.vehicleId,
            plateNumber: a.vehicleId.plateNumber,
            vehicleId: a.vehicleId.vehicleId,
            vehicleType: a.vehicleId.vehicleType
          });
          if (Array.isArray(a.driverIds)) {
            a.driverIds.forEach(d => { if (d) assignedDrivers.push({ _id: d._id || d, fullName: d.fullName, phone: d.phone }); });
          }
          if (Array.isArray(a.staffIds)) {
            a.staffIds.forEach(s => { if (s) assignedStaff.push({ _id: s._id || s, fullName: s.fullName, phone: s.phone }); });
          }
        });
      }

      const uniqById = (items) => {
        const map = new Map();
        (items || []).forEach(it => {
          const id = it && (it._id || it.id || it.vehicleId);
          if (!id) return;
          const key = typeof id === 'object' ? String(id) : String(id);
          if (!map.has(key)) map.set(key, it);
        });
        return Array.from(map.values());
      };

      // compute lastTimelineUpdatedAt (robust)
      const computeLastTimeline = (inv) => {
        if (Array.isArray(inv.timeline) && inv.timeline.length) {
          const times = inv.timeline
            .map(t => t && t.updatedAt ? new Date(t.updatedAt).getTime() : NaN)
            .filter(ts => !Number.isNaN(ts));
          if (times.length) {
            const ms = Math.max(...times);
            return new Date(ms).toISOString();
          }
        }
        if (inv.updatedAt) return new Date(inv.updatedAt).toISOString();
        if (inv.createdAt) return new Date(inv.createdAt).toISOString();
        return null;
      };

      return {
        ...invoice,
        customer: invoice.customerId || null,
        pickup: invoice.requestTicketId?.pickup || null,
        delivery: invoice.requestTicketId?.delivery || null,
        lastTimelineUpdatedAt: computeLastTimeline(invoice),
        assignedVehicles: uniqById(assignedVehicles),
        assignedDrivers: uniqById(assignedDrivers),
        assignedStaff: uniqById(assignedStaff)
      };
    };

    return {
      invoices: invoices.map(normalize),
      total,
      currentPage: Number(page),
      limit: Number(limit)
    };
  } catch (err) {
    console.error('invoiceService.getInvoices error:', err && err.message ? err.message : err);
    throw err;
  }
};

module.exports = {
  getInvoices,
  getInvoiceById
};

// Aggregate revenue for PAID and PARTIAL invoices (server-side total)
const getRevenueAggregate = async ({ search = '' } = {}) => {
  try {
    // build match: only consider PAID and PARTIAL as business rule
    const match = { paymentStatus: { $in: ['PAID', 'PARTIAL'] } };
    if (search && String(search).trim()) {
      const s = String(search).trim();
      match.$or = [
        { code: { $regex: s, $options: 'i' } }
      ];
    }

    // Match PAID and PARTIAL, then sum the invoice total price (same as dashboard behavior)
    const pipeline = [
      { $match: match },
      { $group: { _id: null, totalRevenue: { $sum: { $ifNull: ['$priceSnapshot.totalPrice', { $ifNull: ['$total', 0] }] } } } },
      { $project: { _id: 0, totalRevenue: 1 } }
    ];

    const res = await Invoice.aggregate(pipeline);
    if (res && res[0]) return res[0].totalRevenue || 0;
    return 0;
  } catch (err) {
    console.error('invoiceService.getRevenueAggregate error:', err && err.message ? err.message : err);
    throw err;
  }
};

module.exports = {
  getInvoices,
  getInvoiceById,
  getRevenueAggregate
};

/**
 * Prepare structured data suitable for rendering an e-invoice PDF/HTML
 */
const getEinvoiceData = async (id) => {
  const inv = await getInvoiceById(id);
  // Basic company info (could be moved to config)
  const company = {
    name: process.env.COMPANY_NAME || 'HOMS Company',
    address: process.env.COMPANY_ADDRESS || 'Your company address',
    phone: process.env.COMPANY_PHONE || '',
    email: process.env.COMPANY_EMAIL || ''
  };

  const price = inv.priceSnapshot || {};

  // Try to extract line items from priceSnapshot.breakdown
  let items = [];
  if (price.breakdown) {
    if (Array.isArray(price.breakdown.items) && price.breakdown.items.length) {
      items = price.breakdown.items.map((it, idx) => ({
        id: idx + 1,
        description: it.description || it.name || `Dịch vụ ${idx + 1}`,
        quantity: it.quantity || it.qty || 1,
        unitPrice: Number(it.unitPrice ?? it.price ?? it.amount ?? 0),
        total: Number(it.total ?? it.lineTotal ?? (it.quantity ? (it.quantity * (it.unitPrice || it.price || 0)) : 0))
      }));
    } else if (typeof price.breakdown === 'object') {
      // flatten object entries
      items = Object.keys(price.breakdown).map((k, idx) => ({
        id: idx + 1,
        description: k,
        quantity: 1,
        unitPrice: Number(price.breakdown[k]) || 0,
        total: Number(price.breakdown[k]) || 0
      }));
    }
  }

  if (!items.length) {
    // fallback single line item using totalPrice
    const total = Number(price.totalPrice ?? inv.total ?? 0) || 0;
    items = [{ id: 1, description: 'Dịch vụ vận chuyển', quantity: 1, unitPrice: total, total }];
  }

  const subtotal = Number(price.subtotal ?? items.reduce((s, it) => s + (it.total || 0), 0)) || 0;
  const tax = Number(price.tax ?? 0) || 0;
  const totalPrice = Number(price.totalPrice ?? subtotal + tax) || 0;

  const customer = inv.customer || { fullName: inv.customerId?.fullName || '', phone: inv.customerId?.phone || '', email: inv.customerId?.email || '' };

  // derive a human-friendly service name from moveType/rentalDetails
  const deriveServiceName = (inv) => {
    const mt = inv.requestTicketId?.moveType || inv.moveType || '';
    if (!mt) return 'Dịch vụ vận chuyển';
    switch (String(mt).toUpperCase()) {
      case 'TRUCK_RENTAL':
        return 'Thuê xe tải';
      case 'FULL_HOUSE':
      case 'FULLSERVICE':
        return 'Chuyển nhà trọn gói';
      case 'SPECIFIC_ITEMS':
      default:
        return 'Chuyển đồ lẻ';
    }
  };

  const serviceName = deriveServiceName(inv);

  // If the service is truck rental, e-invoice should only show the delivery/receive address
  // (labeled 'Nhận' in the UI). Omit the pickup ('Lấy') field for TRUCK_RENTAL to match requirement.
  const mt = inv.requestTicketId?.moveType || inv.moveType || '';
  const isTruckRental = String(mt).toUpperCase() === 'TRUCK_RENTAL';
  const pickupToReturn = isTruckRental ? null : (inv.pickup || null);

  return {
    company,
    invoice: {
      id: inv._id,
      code: inv.code,
      date: inv.createdAt || new Date(),
      scheduledTime: inv.scheduledTime || null
    },
    customer,
    pickup: pickupToReturn,
    delivery: inv.delivery || null,
    serviceName,
    items,
    totals: {
      subtotal,
      tax,
      total: totalPrice,
      paidAmount: Number(inv.paidAmount || 0),
      remainingAmount: Number(inv.remainingAmount || (totalPrice - (inv.paidAmount || 0)))
    }
  };
};

module.exports.getEinvoiceData = getEinvoiceData;

/**
 * Generate a PDF buffer for the e-invoice using pdfkit
 * Returns a Buffer containing the PDF
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateEinvoicePdf = async (id) => {
  const data = await getEinvoiceData(id);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Try to load a Unicode font (supports Vietnamese). Prefer environment variable, then common system fonts.
      const tryFonts = [];
      if (process.env.PDF_FONT_REGULAR) tryFonts.push(process.env.PDF_FONT_REGULAR);
      // Windows common
      tryFonts.push('C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/ARIAL.TTF', 'C:/Windows/Fonts/times.ttf');
      // Linux common
      tryFonts.push('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf');
      // relative project fonts folder (if someone places fonts under src/fonts or fonts)
      tryFonts.push(path.join(__dirname, '..', '..', 'fonts', 'NotoSans-Regular.ttf'));

      let regularFont = null;
      let boldFont = null;
      for (const p of tryFonts) {
        try {
          if (!p) continue;
          if (fs.existsSync(p)) {
            regularFont = p;
            break;
          }
        } catch (e) {
          // ignore
        }
      }

      // try to locate a bold face next to regular (common naming)
      if (regularFont) {
        const dir = path.dirname(regularFont);
        const candidates = ['NotoSans-Bold.ttf', 'NotoSans-Bold.otf', 'DejaVuSans-Bold.ttf', 'ARIALBD.TTF', 'arialbd.ttf', 'Arial Bold.ttf'];
        for (const c of candidates) {
          const p = path.join(dir, c);
          if (fs.existsSync(p)) { boldFont = p; break; }
        }
      }

      if (regularFont) {
        console.info('[einvoice.pdf] using font files:', { regularFont, boldFont });
        try {
          if (boldFont) {
            doc.registerFont('Regular', regularFont);
            doc.registerFont('Bold', boldFont);
          } else {
            doc.registerFont('Regular', regularFont);
            // register same font for Bold to avoid missing glyphs
            doc.registerFont('Bold', regularFont);
          }
          doc.font('Bold');
        } catch (e) {
          console.warn('[einvoice.pdf] Failed to register custom font for PDF generation, falling back to built-in fonts', e && e.message);
          doc.font('Helvetica-Bold');
        }
      } else {
        // fallback to built-in fonts (may not support Vietnamese)
        console.warn('[einvoice.pdf] No Unicode font found for PDF generation. If Vietnamese text appears garbled, install a Unicode font and set PDF_FONT_REGULAR env var to its path.');
        doc.font('Helvetica-Bold');
      }

      // Header
      doc.fontSize(18).fillColor('#000').text(data.company.name || 'HOMS', { align: 'left' });
      doc.moveDown(0.2);
      // use regular face for body
      doc.font('Regular');
      doc.fontSize(10).fillColor('#444').text(data.company.address || '', { align: 'left' });
      if (data.company.phone) doc.text(`Tel: ${data.company.phone}`, { align: 'left' });
      if (data.company.email) doc.text(`Email: ${data.company.email}`, { align: 'left' });

      // Invoice box on right
      const topY = doc.y;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const boxWidth = 220;
      const boxX = doc.page.margins.left + pageWidth - boxWidth;

  // Draw invoice box (light border, light fill)
  doc.save();
  doc.lineWidth(1).strokeColor('#ddd');
  doc.rect(boxX, topY - 20, boxWidth, 70).stroke();
  doc.restore();
  doc.fontSize(12).font('Bold').text('HÓA ĐƠN', boxX + 8, topY - 16);
  doc.fontSize(10).font('Regular').text(`Mã: ${data.invoice.code || ''}`, boxX + 8, topY + 2);
  doc.text(`Ngày: ${new Date(data.invoice.date).toLocaleString('vi-VN')}`, boxX + 8, topY + 18);

      doc.moveDown(2);

      // Customer / Addresses
      doc.fontSize(11).font('Helvetica-Bold').text('Khách hàng');
      doc.fontSize(10).font('Helvetica').text(`${data.customer.fullName || ''}`);
      if (data.customer.phone) doc.text(`Tel: ${data.customer.phone}`);
      if (data.customer.email) doc.text(`Email: ${data.customer.email}`);
      doc.moveDown(0.5);

      doc.fontSize(11).font('Helvetica-Bold').text('Địa chỉ');
      doc.fontSize(10).font('Helvetica').text(`Nhận: ${data.delivery?.address || ''}`);
      doc.text(`Lấy: ${data.pickup?.address || ''}`);

      doc.moveDown(1);

  // Items table header
  doc.fontSize(10).font('Bold');
      const tableTop = doc.y;
      doc.text('Mục', doc.page.margins.left, tableTop);
      doc.text('Số lượng', doc.page.margins.left + 300, tableTop, { width: 60, align: 'right' });
      doc.text('Đơn giá', doc.page.margins.left + 360, tableTop, { width: 90, align: 'right' });
      doc.text('Thành tiền', doc.page.margins.left + 460, tableTop, { width: 90, align: 'right' });

  doc.moveDown(0.5);
  doc.font('Regular').fontSize(10);

      data.items.forEach((it) => {
        const y = doc.y;
        doc.text(it.description || '', doc.page.margins.left, y, { width: 280 });
        doc.text(String(it.quantity || 1), doc.page.margins.left + 300, y, { width: 60, align: 'right' });
        doc.text(new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(it.unitPrice || 0), doc.page.margins.left + 360, y, { width: 90, align: 'right' });
        doc.text(new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(it.total || 0), doc.page.margins.left + 460, y, { width: 90, align: 'right' });
        doc.moveDown(0.7);
      });

      doc.moveDown(0.5);

  // Totals
      const format = (v) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0);
      doc.moveDown(0.5);
      const rightX = doc.page.margins.left + pageWidth;
      const labelX = doc.page.margins.left + 360;

      doc.text('Tạm tính:', labelX, doc.y, { width: 90, align: 'left' });
      doc.text(format(data.totals.subtotal), labelX + 90, doc.y, { width: 120, align: 'right' });
      doc.moveDown(0.3);
      doc.text('Thuế (VAT):', labelX, doc.y, { width: 90, align: 'left' });
      doc.text(format(data.totals.tax), labelX + 90, doc.y, { width: 120, align: 'right' });
      doc.moveDown(0.3);
      doc.text('Tổng cộng:', labelX, doc.y, { width: 90, align: 'left' });
  doc.font('Bold').text(format(data.totals.total), labelX + 90, doc.y, { width: 120, align: 'right' });
      doc.moveDown(1);

      // Footer notes
      if (data.invoice.notes) {
        doc.font('Helvetica').fontSize(9).text('Ghi chú:', { underline: true });
        doc.text(data.invoice.notes || '', { width: pageWidth - 40 });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports.generateEinvoicePdf = generateEinvoicePdf;