const Promotion = require('../models/Promotion');
const RequestTicket = require('../models/RequestTicket');
const Invoice = require('../models/Invoice');

/**
 * POST /api/promotions/apply
 * Body: { code, requestTicketId }
 * Auth: user must own the request ticket (or admin)
 */
const applyPromotion = async (req, res) => {
  try {
    // Accept either promotionId or code (backwards compatible)
    const { code, requestTicketId, promotionId } = req.body;
    if ((!code && !promotionId) || !requestTicketId) {
      return res.status(400).json({ success: false, message: 'Missing promotion identifier or requestTicketId' });
    }

    let promo = null;
    if (promotionId) {
      promo = await Promotion.findById(promotionId);
    } else {
      promo = await Promotion.findOne({ code: code.toUpperCase() });
    }
    if (!promo || promo.status !== 'Active') return res.status(404).json({ success: false, message: 'Mã khuyến mãi không tồn tại hoặc không hoạt động' });

    const now = new Date();
    if (promo.validFrom && now < promo.validFrom) return res.status(400).json({ success: false, message: 'Khuyến mãi chưa bắt đầu' });
    if (promo.validUntil && now > promo.validUntil) return res.status(400).json({ success: false, message: 'Khuyến mãi đã hết hạn' });

  const ticket = await RequestTicket.findById(requestTicketId);
    if (!ticket) return res.status(404).json({ success: false, message: 'Yêu cầu chuyển không tồn tại' });

    // Disallow applying promotions to orders that are already paid or partially paid.
    // Find related invoice (if any) and check paymentStatus.
    const relatedInvoice = await Invoice.findOne({ requestTicketId: ticket._id });
    if (relatedInvoice && relatedInvoice.paymentStatus && relatedInvoice.paymentStatus !== 'UNPAID') {
      return res.status(400).json({ success: false, message: 'Khuyến mãi chỉ áp dụng cho đơn chưa thanh toán' });
    }

    // Only owner or admin may apply promotion
    if (req.user && req.user.role && req.user.role.toLowerCase() !== 'admin') {
      const uid = (req.user._id || req.user.userId).toString();
      if (ticket.customerId.toString() !== uid) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện hành động này' });
      }
    }

    const pricing = ticket.pricing || {};
    const baseTotal = Number(pricing.totalPrice || 0);
    if (!baseTotal || baseTotal <= 0) return res.status(400).json({ success: false, message: 'Không có giá hợp lệ để áp dụng khuyến mãi' });

    // check usage limit
    if (promo.usageLimit && (promo.usageCount || 0) >= promo.usageLimit) {
      return res.status(400).json({ success: false, message: 'Khuyến mãi đã đạt giới hạn sử dụng' });
    }

    // Check min order amount if set
    if (promo.minOrderAmount && baseTotal < promo.minOrderAmount) {
      return res.status(400).json({ success: false, message: `Đơn hàng phải từ ${promo.minOrderAmount.toLocaleString()}₫ mới áp dụng được mã này` });
    }

    // Check applicable services (moveType) if set
    if (Array.isArray(promo.applicableServices) && promo.applicableServices.length > 0) {
      const moveType = ticket.moveType;
      if (!moveType || !promo.applicableServices.map(s => String(s).toUpperCase()).includes(String(moveType).toUpperCase())) {
        return res.status(400).json({ success: false, message: 'Khuyến mãi không áp dụng cho loại dịch vụ này' });
      }
    }

    // NOTE: area-based restrictions removed by request — promotions will no longer
    // be blocked by pickup/delivery district. Other checks (minOrderAmount,
    // applicableServices, usageLimit, dates) remain in place.

    // Compute discount — per requirement apply after tax (on totalPrice)
    let discountAmount = 0;
    if (promo.discountType === 'Percentage') {
      discountAmount = Math.round(baseTotal * (promo.discountValue / 100));
      if (promo.maxDiscount) discountAmount = Math.min(discountAmount, promo.maxDiscount);
    } else { // FixedAmount
      discountAmount = Number(promo.discountValue || 0);
      if (promo.maxDiscount) discountAmount = Math.min(discountAmount, promo.maxDiscount);
    }

    if (discountAmount <= 0) return res.status(400).json({ success: false, message: 'Giá trị khuyến mãi không hợp lệ' });

    const totalAfter = Math.max(0, baseTotal - discountAmount);

    // Persist to RequestTicket.pricing (store promotion id and metadata)
    ticket.pricing = ticket.pricing || {};
    ticket.pricing.promotion = {
      promotionId: promo._id,
      code: promo.code,
      discountAmount,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      appliedAt: new Date()
    };
    ticket.pricing.totalAfterPromotion = totalAfter;
    await ticket.save();

    // If an invoice exists for this ticket, update invoice snapshot too
    const invoice = await Invoice.findOne({ requestTicketId: ticket._id });
    if (invoice) {
      invoice.priceSnapshot = invoice.priceSnapshot || {};
      invoice.priceSnapshot.promotion = {
        promotionId: promo._id,
        code: promo.code,
        discountAmount,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        appliedAt: new Date()
      };
      invoice.priceSnapshot.totalPrice = totalAfter;
      await invoice.save();
    }

    // increment usage count (best-effort)
    try {
      promo.usageCount = (promo.usageCount || 0) + 1;
      if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
        promo.status = 'Expired';
      }
      await promo.save();
    } catch (e) {
      console.warn('Failed to increment promotion usage count', e.message || e);
    }

    return res.json({ success: true, data: { discountAmount, totalBefore: baseTotal, totalAfter, pricing: ticket.pricing } });
  } catch (err) {
    console.error('[applyPromotion]', err);
    return res.status(500).json({ success: false, message: 'Lỗi server khi áp dụng khuyến mãi' });
  }
};

/**
 * GET /api/promotions/available?requestTicketId=...
 * Returns active promotions applicable to a request ticket (basic filters)
 */
const getAvailablePromotions = async (req, res) => {
  try {
    const { requestTicketId } = req.query;
    const now = new Date();

    let promos = await Promotion.find({ status: 'Active' }).lean();

    // basic date filter
    promos = promos.filter(p => {
      if (p.validFrom && now < p.validFrom) return false;
      if (p.validUntil && now > p.validUntil) return false;
      return true;
    });

    // if requestTicketId provided, further filter by minOrderAmount and applicableServices/services
    if (requestTicketId) {
      const ticket = await RequestTicket.findById(requestTicketId).lean();
      if (ticket) {
        // If an invoice exists and is PAID or PARTIAL, do not return any promotions for this ticket.
        const invoice = await Invoice.findOne({ requestTicketId: ticket._id }).lean();
        if (invoice && invoice.paymentStatus && invoice.paymentStatus !== 'UNPAID') {
          return res.json({ success: true, data: [] });
        }

        const totalPrice = Number(ticket.pricing?.totalPrice || 0);
        const pickupDistrict = ticket.pickup?.district;
        const deliveryDistrict = ticket.delivery?.district;

        // Filter promotions by minOrderAmount and applicableServices only.
        promos = promos.filter(p => {
          if (p.minOrderAmount && totalPrice < p.minOrderAmount) return false;
          if (Array.isArray(p.applicableServices) && p.applicableServices.length > 0) {
            const moveType = ticket.moveType;
            if (!moveType || !p.applicableServices.map(s => String(s).toUpperCase()).includes(String(moveType).toUpperCase())) {
              return false;
            }
          }
          return true;
        });
      }
    }

    // map to minimal DTO
    const data = promos.map(p => ({ code: p.code, description: p.description, discountType: p.discountType, discountValue: p.discountValue, maxDiscount: p.maxDiscount }));
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[getAvailablePromotions]', err);
    return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách khuyến mãi' });
  }
};

module.exports = { applyPromotion, getAvailablePromotions };
