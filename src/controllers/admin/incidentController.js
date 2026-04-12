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

// GET /admin/incidents/export
// Exports incidents matching query (search, type, status) as XLSX attachment
const exportIncidents = async (req, res) => {
	try {
		const { search, type, status } = req.query;
		// request a large limit to include all matching records
		const result = await incidentService.listIncidents({ search, type, status, page: 1, limit: 10000 });

		// normalize to array of incident objects
		let rows = [];
		if (Array.isArray(result)) rows = result;
		else if (Array.isArray(result?.data)) rows = result.data;
		else if (Array.isArray(result?.data?.data)) rows = result.data.data;
		else if (Array.isArray(result?.docs)) rows = result.docs;
		else if (Array.isArray(result?.data?.docs)) rows = result.data.docs;
		else rows = [];

		// map incidents to flat objects for spreadsheet
		const mapped = rows.map((it) => ({
			InvoiceCode: String(it?.invoiceId?.code || (it?.invoiceId || '') || ''),
			Reporter: String(it?.reporterId?.fullName || it?.reporterName || ''),
			ReporterPhone: String(it?.reporterId?.phone ?? ''),
			Type: String(it?.type || ''),
			Status: String(it?.status || ''),
			CreatedAt: String(it?.createdAt ? new Date(it.createdAt).toLocaleString('vi-VN') : ''),
			Description: String(it?.description || ''),
			ResolutionAction: String(it?.resolution?.action || ''),
			CompensationAmount: (it?.resolution?.compensationAmount != null) ? it.resolution.compensationAmount : '',
		}));

		// try to use xlsx (sheetjs) to build workbook
		try {
			const XLSX = require('xlsx');
			const ws = XLSX.utils.json_to_sheet(mapped);
			// Auto-width columns: compute max text length per column and set approximate width
			try {
				const headers = Object.keys(mapped[0] || {});
				const cols = headers.map((h) => {
					let max = h.length;
					for (let i = 0; i < mapped.length; i++) {
						const val = mapped[i][h];
						const len = val == null ? 0 : String(val).length;
						if (len > max) max = len;
					}
					// wch is roughly number of characters; clamp to reasonable bounds
					const wch = Math.min(50, Math.max(10, Math.ceil(max * 1.2)));
					return { wch };
				});
				ws['!cols'] = cols;
			} catch (errAuto) {
				// ignore auto-width failures and continue
			}
			// Ensure CreatedAt column is treated as text (avoid Excel date/number formatting -> ####)
			try {
				const headers = Object.keys(mapped[0] || {});
				const createdIndex = headers.findIndex(h => (h || '').toLowerCase() === 'createdat');
				if (createdIndex >= 0) {
					const colLetter = XLSX.utils.encode_col(createdIndex);
					for (let i = 0; i < mapped.length; i++) {
						const cellAddr = `${colLetter}${i + 2}`; // +2 because sheet header is row 1
						if (ws[cellAddr]) {
							ws[cellAddr].t = 's';
							ws[cellAddr].v = String(mapped[i].CreatedAt || '');
						}
					}
					// ensure column is reasonably wide
					ws['!cols'] = ws['!cols'] || [];
					ws['!cols'][createdIndex] = { wch: Math.max((ws['!cols'][createdIndex]?.wch) || 20, 20) };
				}
			} catch (errForce) {
				// ignore and proceed
			}
			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Incidents');
			const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

			const now = new Date();
			const yyyy = now.getFullYear();
			const mm = String(now.getMonth() + 1).padStart(2, '0');
			const dd = String(now.getDate()).padStart(2, '0');
			const filename = `incidents_${yyyy}${mm}${dd}.xlsx`;

			res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
			res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			return res.send(buf);
		} catch (e) {
			// fallback to CSV if xlsx not available
			const headers = ['InvoiceCode', 'Reporter', 'ReporterPhone', 'Type', 'Status', 'CreatedAt', 'Description', 'ResolutionAction', 'CompensationAmount'];
			const rowsCsv = mapped.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
			const csv = [headers.join(','), rowsCsv].join('\n');

			const now = new Date();
			const yyyy = now.getFullYear();
			const mm = String(now.getMonth() + 1).padStart(2, '0');
			const dd = String(now.getDate()).padStart(2, '0');
			const filename = `incidents_${yyyy}${mm}${dd}.csv`;

			res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
			res.setHeader('Content-Type', 'text/csv; charset=utf-8');
			// Prepend UTF-8 BOM so Excel on Windows detects UTF-8 encoding correctly
			return res.send(Buffer.from('\uFEFF' + csv, 'utf8'));
		}
	} catch (err) {
		console.error('Export incidents failed', err);
		return sendError(res, err);
	}
};

module.exports = {
	listIncidents,
	getIncident,
	resolveIncident,
	exportIncidents,
};

