const invoiceService = require('../../services/admin/invoiceService');

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

module.exports = {
  getInvoice,
  listInvoices
};
