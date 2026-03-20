const incidentService = require('../../services/admin/incidentService');

// Helper for error responses
const sendError = (res, err) => {
	const status = err.statusCode || 500;
	return res.status(status).json({ success: false, message: err.message || 'Internal server error' });
};

// GET /admin/incidents
// Query: search, type, status, page, limit
const listIncidents = async (req, res) => {
	try {
		const { search, type, status, page, limit } = req.query;
		const result = await incidentService.listIncidents({ search, type, status, page: Number(page) || 1, limit: Number(limit) || 10 });
		return res.status(200).json({ success: true, data: result });
	} catch (err) {
		return sendError(res, err);
	}
};

// GET /admin/incidents/:id
const getIncident = async (req, res) => {
	try {
		const incident = await incidentService.getIncidentById(req.params.id);
		return res.status(200).json({ success: true, data: incident });
	} catch (err) {
		return sendError(res, err);
	}
};

// PATCH /admin/incidents/:id/resolve
// Body: { status, action, compensationAmount, resolvedAt }
const resolveIncident = async (req, res) => {
	try {
		const payload = req.body || {};
		const updated = await incidentService.resolveIncident(req.params.id, payload, req.user);
		return res.status(200).json({ success: true, message: 'Đã cập nhật trạng thái sự cố.', data: updated });
	} catch (err) {
		return sendError(res, err);
	}
};

module.exports = {
	listIncidents,
	getIncident,
	resolveIncident,
};