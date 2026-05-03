const express = require('express');
const router = express.Router();
const publicPricingController = require('../controllers/publicPricingController');
const recommendationController = require('../controllers/recommendationController');
const serviceRatingController = require('../controllers/serviceRatingController');
const invoiceService = require('../services/invoiceService');

// POST /api/public/estimate-price
router.post('/estimate-price', publicPricingController.estimatePrice);

// POST /api/public/best-moving-time - AI-powered suggestion for best moving time
router.post('/best-moving-time', recommendationController.getBestMovingTime);

// GET /api/public/ratings - Lấy đánh giá tốt cho Landing Page
router.get('/ratings', serviceRatingController.getPublicRatings);

// GET /api/public/recent-orders - Lấy dữ liệu đơn hàng thành công gần đây rải rác trên Landing Page
router.get('/recent-orders', async (req, res) => {
  try {
    const data = await invoiceService.getRecentCompleted(5);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const emailService = require('../services/emailService');

// POST /api/public/contact
router.post('/contact', async (req, res) => {
  try {
    const { fullName, phone, email, source } = req.body;
    
    const subject = `Liên hệ mới từ khách hàng: ${fullName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h3 style="color: #2D4F36;">Yêu cầu liên hệ mới từ website HOMS</h3>
        <p><strong>Họ tên:</strong> ${fullName}</p>
        <p><strong>Số điện thoại:</strong> ${phone}</p>
        <p><strong>Email:</strong> ${email || 'Không cung cấp'}</p>
        <p><strong>Nguồn biết đến HOMS:</strong> ${source || 'Không rõ'}</p>
      </div>
    `;
    
    await emailService.sendMail({
      to: 'homsmovinghouse@gmail.com',
      subject,
      html
    });

    res.json({ success: true, message: 'Đã gửi liên hệ thành công' });
  } catch (error) {
    console.error('Lỗi gửi form liên hệ:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi gửi liên hệ' });
  }
});

module.exports = router;
