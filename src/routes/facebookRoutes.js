const express = require('express');
const router = express.Router();
const facebookController = require('../controllers/facebookController');


router.get('/facebook-webhook', facebookController.verifyWebhook);
router.post('/facebook-webhook', facebookController.handleIncomingWebhook);

module.exports = router;