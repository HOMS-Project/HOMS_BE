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
        res.status(200).json({ success: true, data: templates });
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

exports.getContracts = async (req, res, next) => {
    try {
        const contracts = await adminContractService.getContracts(req.query);
        res.status(200).json({ success: true, data: contracts });
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
