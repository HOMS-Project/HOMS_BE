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

module.exports = {
  getInvoice,
};
