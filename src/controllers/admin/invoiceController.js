const invoiceService = require('../../services/admin/invoiceService');
const Invoice = require('../../models/Invoice');

// Helper for error responses
const sendError = (res, err) => {
  const status = err.statusCode || 500;
  return res.status(status).json({ success: false, message: err.message || 'Internal server error' });
};

// GET /api/admin/invoices/:id
const getInvoice = async (req, res) => {
  try {
    const invoice = await invoiceService.getInvoiceById(req.params.id);
    return res.status(200).json({ success: true, data: invoice });
  } catch (err) {
    return sendError(res, err);
  }
};

// GET /api/admin/invoices/:id/einvoice
const getEinvoice = async (req, res) => {
  try {
    const data = await invoiceService.getEinvoiceData(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return sendError(res, err);
  }
};

/*
// GET /api/admin/invoices/:id/einvoice/pdf
// Temporarily disabled: PDF generation endpoint commented out per request
const getEinvoicePdf = async (req, res) => {
  try {
    // service will return a Buffer containing PDF
    const pdfBuffer = await invoiceService.generateEinvoicePdf(req.params.id);
    const filename = `invoice-${req.params.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(pdfBuffer);
  } catch (err) {
    return sendError(res, err);
  }
};
*/

// GET /api/admin/invoices
const listInvoices = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const search = req.query.search || '';
    const status = req.query.status || undefined;

    const payload = await invoiceService.getInvoices({ page, limit, search, status });
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return sendError(res, err);
  }
};

// GET /api/admin/invoices/revenue-aggregate
const getRevenueAggregate = async (req, res) => {
  try {
    const search = req.query.search || '';
    const total = await invoiceService.getRevenueAggregate({ search });
    return res.status(200).json({ success: true, data: { totalRevenue: total } });
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports = {
  getInvoice,
  listInvoices
  ,getRevenueAggregate
  ,getEinvoice
  // getEinvoicePdf temporarily removed
};