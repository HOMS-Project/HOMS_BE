const adminUserService = require('../../services/admin/userService');

exports.getAllUsers = async (req, res, next) => {
    try {
    
        const result = await adminUserService.getAllUsers(req.query);
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};

exports.getUserById = async (req, res, next) => {
    try {
        const user = await adminUserService.getUserById(req.params.id);
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        if (error.message === 'User not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.createUser = async (req, res, next) => {
    try {
        // Admin creates roles like dispatcher, driver, staff
        // Normalize incoming payload: allow FE to send phoneNumber
        const payload = { ...req.body };
        if (payload.phoneNumber && !payload.phone) payload.phone = payload.phoneNumber;

        const newUser = await adminUserService.createUser(payload);
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: newUser
        });
    } catch (error) {
        if (error.message === 'Email or phone already exists') {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (error.message && error.message.startsWith('Invalid role')) {
            return res.status(400).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.updateUser = async (req, res, next) => {
    try {
        // Normalize payload: allow FE to send phoneNumber and workingAreas
        const payload = { ...req.body };
        if (payload.phoneNumber && !payload.phone) payload.phone = payload.phoneNumber;
        if (payload.workingAreas && !payload.dispatcherProfile) {
            payload.dispatcherProfile = { workingAreas: payload.workingAreas };
            delete payload.workingAreas;
        }
        if (payload.role) payload.role = String(payload.role).toLowerCase();

        const updatedUser = await adminUserService.updateUser(req.params.id, payload);
        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: updatedUser
        });
    } catch (error) {
        if (error.message === 'User not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.deleteUser = async (req, res, next) => {
    try {
        const user = await adminUserService.deleteUser(req.params.id);
        res.status(200).json({
            success: true,
            message: 'User blocked successfully',
            data: user
        });
    } catch (error) {
        if (error.message === 'User not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        next(error);
    }
};

exports.banUser = async (req, res, next) => {
    try {
        const reason = req.body?.reason || null;
        const performedBy = req.user?._id || null;
        const user = await adminUserService.banUser(req.params.id, { reason, performedBy });
        res.status(200).json({ success: true, message: 'User account has been banned successfully.', data: user });
    } catch (error) {
        if (error.message === 'User not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message === 'User already banned') {
            return res.status(400).json({ success: false, message: 'User account is already banned.' });
        }
        next(error);
    }
};

exports.unbanUser = async (req, res, next) => {
    try {
        const reason = req.body?.reason || null;
        const performedBy = req.user?._id || null;
        const user = await adminUserService.unbanUser(req.params.id, { reason, performedBy });
        res.status(200).json({ success: true, message: 'User account has been unbanned successfully.', data: user });
    } catch (error) {
        if (error.message === 'User not found') {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message === 'User is not banned') {
            return res.status(400).json({ success: false, message: 'User account is not currently banned.' });
        }
        next(error);
    }
};
