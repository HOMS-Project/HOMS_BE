const adminContractService = require('../../services/admin/contractService');

exports.createTemplate = async (req, res, next) => {
  try {
    const template = await adminContractService.createTemplate(req.body, req.user.userId);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
};

exports.getTemplates = async (req, res, next) => {
  try {
    const templates = await adminContractService.getTemplates(req.query);
    // Standardize response shape for frontend: { success: true, data: [...] }
    return res.status(200).json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
};

exports.generateContract = async (req, res, next) => {
  try {
    const contract = await adminContractService.generateContract(req.body, req.user.userId);
    res.status(201).json({ success: true, data: contract });
  } catch (error) {
    if (error.message === 'Template not found' || error.message === 'Request Ticket not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

exports.updateTemplate = async (req, res, next) => {
  try {
    const id = req.params.id;
    const updated = await adminContractService.updateTemplate(id, req.body, req.user && (req.user.userId || req.user.id));
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    if (error.message === 'Template not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    // validation errors from mongoose will fall through
    next(error);
  }
};

exports.activateTemplate = async (req, res, next) => {
  try {
    const id = req.params.id;
    console.log('ADMIN activate template request for id=', id);
    const tpl = await adminContractService.activateTemplate(id);
    return res.status(200).json({ success: true, data: tpl });
  } catch (error) {
    if (error.message === 'Template not found') return res.status(404).json({ success: false, message: error.message });
    next(error);
  }
};

exports.deactivateTemplate = async (req, res, next) => {
  try {
    const id = req.params.id;
    console.log('ADMIN deactivate template request for id=', id);
    const tpl = await adminContractService.deactivateTemplate(id);
    return res.status(200).json({ success: true, data: tpl });
  } catch (error) {
    if (error.message === 'Template not found') return res.status(404).json({ success: false, message: error.message });
    next(error);
  }
};

exports.getContracts = async (req, res, next) => {
  try {
    const contracts = await adminContractService.getContracts(req.query);
    // Normalize service output to a consistent API shape:
    // { success: true, data: [...], meta?: { total, page, limit } }
    if (contracts && typeof contracts === 'object' && Array.isArray(contracts.data)) {
      const { data, total, page, limit } = contracts;
      return res.status(200).json({ success: true, data, meta: { total, page, limit } });
    }

    // contracts may be a plain array (backwards compatible)
    if (Array.isArray(contracts)) {
      return res.status(200).json({ success: true, data: contracts });
    }

    // Fallback: return whatever we got
    return res.status(200).json({ success: true, data: contracts });
  } catch (error) {
    next(error);
  }
};

exports.getContractById = async (req, res, next) => {
  try {
    const contract = await adminContractService.getContractById(req.params.id);
    if (!contract) return res.status(404).json({ success: false, message: 'Contract not found' });
    return res.status(200).json({ success: true, data: contract });
  } catch (error) {
    next(error);
  }
};

exports.signContract = async (req, res, next) => {
  try {
    // user object từ authMiddleware
    const contract = await adminContractService.signContract(req.params.id, req.body, req.user);
    res.status(200).json({ success: true, data: contract });
  } catch (error) {
    if (error.message === 'Contract not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.message === 'Contract is already signed') {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

exports.downloadContract = async (req, res, next) => {
  try {
    const { filename, html } = await adminContractService.getContractFile(req.params.id);
    // Sanitize filename for header (remove control/newline/quote chars)
    const rawName = String(filename || 'contract.html');
    const safeAscii = rawName.replace(/[\r\n\"]/g, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/[^\x20-\x7E]/g, '_');
    // Use RFC5987 encoding for UTF-8 filenames and provide an ASCII fallback
    const encoded = encodeURIComponent(rawName);
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    if (error.message === 'Contract not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};

exports.downloadContractDocx = async (req, res, next) => {
  try {
    // Previously returned DOCX; now return PDF. Keep route for compatibility but send PDF content.
    const { filename, buffer } = await adminContractService.getContractPdf(req.params.id);
    // sanitize filename similar to html download
    const rawName = String(filename || 'contract.pdf');
    const safeAscii = rawName.replace(/[\r\n\"]/g, '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/[^\x20-\x7E]/g, '_');
    const encoded = encodeURIComponent(rawName);
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(buffer);
  } catch (error) {
    if (String(error.message || '').toLowerCase().includes('dependency missing')) {
      // return helpful message for developer
      return res.status(500).json({ success: false, message: error.message });
    }
    if (error.message === 'Contract not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};
