const orderService = require('../../services/admin/orderService');

const sendError = (res, err) => {
  const status = err.statusCode || 500;
  return res.status(status).json({ success: false, message: err.message || 'Internal server error' });
};

const listOrders = async (req, res) => {
  try {
    // parse numeric params defensively
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const status = req.query.status || undefined;
    const from = req.query.from || undefined;
    const to = req.query.to || undefined;
    const search = req.query.search || '';
    const source = req.query.source || undefined;

    const summary = String(req.query.summary).toLowerCase() === 'true';
    const payload = await orderService.listOrders({ page, limit, status, from, to, search, source, summary });
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return sendError(res, err);
  }
};

const getOrder = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, message: 'Missing id parameter' });

    // support both service method names for historical compatibility
    const loader = orderService.getOrderById || orderService.getOrder || orderService.get;
    if (!loader) throw new Error('Order service does not implement a getOrder function');

    const payload = await loader.call(orderService, id);
    return res.status(200).json({ success: true, data: payload });
  } catch (err) {
    return sendError(res, err);
  }
};

module.exports = {
  listOrders,
  getOrder
};
