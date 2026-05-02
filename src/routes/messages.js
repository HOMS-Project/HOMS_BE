const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticate } = require('../middlewares/authMiddleware');

router.get('/ticket/:ticketCode', authenticate, messageController.getMessagesForTicket);

module.exports = router;
