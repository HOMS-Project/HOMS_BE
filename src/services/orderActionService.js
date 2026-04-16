const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const ContractTemplate = require('../models/ContractTemplate');
const Contract = require('../models/Contract');
const InvoiceService = require('./invoiceService');
const GeocodeService = require('./geocodeService');
const PricingCalculationService = require('./pricingCalculationService');
const RouteValidationService = require('./routeValidationService');
const SurveyData = require('../models/SurveyData');
const PricingData = require('../models/PricingData');
const Promotion = require('../models/Promotion');
const RequestTicket = require('../models/RequestTicket');

const GOONG_API_KEY = process.env.GOONG_API_KEY;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// ─────────────────────────────────────────────────────────────
// GOONG / OSRM HELPERS
// ─────────────────────────────────────────────────────────────

/** Chuyển địa chỉ text thành tọa độ { lat, lng } */
async function getCoordinates(address) {
  try {
    const searchAddress = address.toLowerCase().includes('đà nẵng')
      ? address
      : `${address}, Đà Nẵng, Việt Nam`;

    const res = await axios.get('https://rsapi.goong.io/geocode', {
      params: { address: searchAddress, api_key: GOONG_API_KEY }
    });
    if (res.data.results && res.data.results.length > 0) {
      return res.data.results[0].geometry.location; // { lat, lng }
    }
    return null;
  } catch (err) {
    console.error('[Goong] Forward Geocode lỗi:', err.message);
    return null;
  }
}

/** Tính khoảng cách giữa 2 tọa độ (km), fallback OSRM */
async function getRouteDistance(originCoords, destCoords) {
  if (!originCoords || !destCoords) return 0;

  // 1. Thử Goong Direction
  try {
    const url =
      `https://rsapi.goong.io/Direction` +
      `?origin=${originCoords.lat},${originCoords.lng}` +
      `&destination=${destCoords.lat},${destCoords.lng}` +
      `&vehicle=car&api_key=${GOONG_API_KEY}`;
    const res = await axios.get(url);
    const meters = res.data?.routes?.[0]?.legs?.[0]?.distance?.value;
    if (meters > 0) return Math.round(meters / 100) / 10;
  } catch (e) {
    console.warn('[Route] Goong failed:', e.message);
  }

  // 2. Fallback OSRM
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}` +
      `?overview=false`;
    const res = await axios.get(url);
    const meters = res.data?.routes?.[0]?.distance;
    if (meters > 0) return Math.round(meters / 100) / 10;
  } catch (e) {
    console.warn('[Route] OSRM failed:', e.message);
  }

  return 5; // Fallback mặc định
}

/** Ước tính số giờ dựa trên khoảng cách, tầng lầu, số nhân viên */
function computeEstimatedHours({ distanceKm = 0, floors = 0, suggestedStaffCount = 2 }) {
  let hours = 2;
  hours += distanceKm * 0.1;
  hours += floors * 0.5;
  if (suggestedStaffCount <= 2) hours += 1;
  return Math.ceil(hours);
}

/** Chọn loại xe và số nhân viên phù hợp dựa trên khối lượng/thể tích */
function suggestVehicleAndStaff(vol, wgt) {
  if (vol > 10 || wgt > 1500) return { vehicleType: '2TON',   staffCount: 3 };
  if (vol > 6  || wgt > 1000) return { vehicleType: '1.5TON', staffCount: 2 };
  if (vol > 3  || wgt > 500)  return { vehicleType: '1TON',   staffCount: 2 };
  return { vehicleType: '500KG', staffCount: 2 };
}

// ─────────────────────────────────────────────────────────────
// ACTION: TÍNH GIÁ
// ─────────────────────────────────────────────────────────────

/**
 * Xử lý action CALCULATE_PRICE từ AI.
 * @param {object} aiAction   - Object action từ AI (aiAction.data)
 * @param {object} session    - Session của user (đọc/ghi visionItems, surveyDataCache, ...)
 * @returns {string}          - Tin nhắn kết quả để feed lại cho AI
 */
async function handleCalculatePrice(aiAction, session) {
  const data = aiAction.data;

  if (!data.from || !data.to || data.from === 'địa chỉ đi') {
    return '[HỆ_THỐNG_BÁO_LỖI]: Bạn chưa lấy đủ địa chỉ ĐI và ĐẾN chi tiết. Hãy khéo léo xin lỗi và hỏi lại khách hàng ngay lập tức!';
  }

  console.log('🔄 Đang tính giá bằng API thật...', data);

  // 1. Lấy tọa độ
  const fromCoords = await getCoordinates(data.from);
  const toCoords   = await getCoordinates(data.to);
  if (!fromCoords || !toCoords) {
    return '[HỆ_THỐNG_BÁO_LỖI]: Không tìm thấy địa chỉ này trên bản đồ Đà Nẵng. Nhờ khách kiểm tra lại tên đường/quận.';
  }

  // 2. Khoảng cách & quận
  const distanceKm       = await getRouteDistance(fromCoords, toCoords);
  const pickupDistrict   = await GeocodeService.reverseGeocode(fromCoords.lat, fromCoords.lng);
  const deliveryDistrict = await GeocodeService.reverseGeocode(toCoords.lat, toCoords.lng);

  // 3. Thời gian chuyển
  let pickupTime = new Date();
  if (data.movingTime) {
    const parsed = new Date(data.movingTime);
    if (!isNaN(parsed.getTime())) pickupTime = parsed;
  }

  // 4. Xe & nhân viên
  const vol = session.visionVolume || 1;
  const wgt = session.visionWeight || 100;
  const { vehicleType: tempVehicleType, staffCount: tempStaffCount } = suggestVehicleAndStaff(vol, wgt);
  const floors         = Number(data.floors) || 0;
  const estimatedHours = computeEstimatedHours({ distanceKm, floors, suggestedStaffCount: tempStaffCount });

  // 5. Validate lộ trình
  const routeValidation = await RouteValidationService.validateRoute(null, {
    vehicleType:    tempVehicleType,
    totalWeight:    wgt,
    totalVolume:    vol,
    pickupTime,
    pickupAddress:  data.from,
    deliveryAddress: data.to
  });

  // 6. Build surveyData
  const finalItems = (session.visionItems && session.visionItems.length > 0)
    ? session.visionItems
    : (data.items || []);

  const surveyData = {
    pickup:           { address: data.from,  coordinates: fromCoords,  district: pickupDistrict },
    delivery:         { address: data.to,    coordinates: toCoords,    district: deliveryDistrict },
    distanceKm,
    carryMeter:       Number(data.carryMeter) || 0,
    floors,
    hasElevator:      data.hasElevator      || false,
    needsAssembling:  data.needsAssembling  || false,
    needsPacking:     data.needsPacking     || false,
    items:            finalItems,
    scheduledTime:    pickupTime,
    suggestedVehicle: tempVehicleType,
    suggestedStaffCount: tempStaffCount,
    estimatedHours,
    totalActualWeight: wgt,
    totalActualVolume: vol,
    insuranceRequired: false,
    declaredValue:     0
  };

  // Lưu cache để tạo đơn sau
  session.surveyDataCache = surveyData;

  // 7. Tính giá
  let finalPrice = 0;
  try {
    const priceList   = await PricingCalculationService.getActivePriceList();
    const priceResult = await PricingCalculationService.calculatePricing(surveyData, priceList);
    finalPrice                   = priceResult.totalPrice;
    session.calculatedPriceResult = priceResult;
    session.calculatedBreakdown   = priceResult.breakdown;
  } catch (pricingErr) {
    console.error('[Pricing Error]', pricingErr.message);
    session.calculatedBreakdown = null;
  }

  // 8. Cảnh báo lộ trình
  let routeAlertMsg = '';
  if (routeValidation.warnings?.length > 0) {
    routeAlertMsg += `\n[CẢNH BÁO LỘ TRÌNH]: ${routeValidation.warnings.join(' | ')}. Khéo léo nhắc nhở khách hàng về khả năng chậm trễ.`;
  }
  if (routeValidation.violations?.length > 0) {
    routeAlertMsg += `\n[VI PHẠM QUY ĐỊNH]: ${routeValidation.violations.join(' | ')}. Hãy báo khách hàng rằng khung giờ này bị cấm tải hoặc xe không vào được, đề nghị đổi giờ.`;
  }

  return (
    `[GIÁ_THỰC_TẾ_TỪ_HỆ_THỐNG]: Tổng chi phí là ${finalPrice.toLocaleString('vi-VN')} VNĐ ` +
    `(Khoảng cách: ${distanceKm}km).${routeAlertMsg} Hãy báo giá này cho khách!`
  );
}

// ─────────────────────────────────────────────────────────────
// ACTION: TẠO MÃ KHUYẾN MÃI
// ─────────────────────────────────────────────────────────────

/**
 * Tạo mã giảm giá thật vào DB và trả về message feed cho AI.
 * @param {object} aiAction
 * @returns {string}
 */
async function handleRequestDiscount(aiAction) {
  const percent = aiAction.percent || 5;
  const newCode = `HOMS-SEPDUYET-${Math.floor(1000 + Math.random() * 9000)}`;

  console.log(`🔥 Đang tạo mã khuyến mãi THẬT vào DB: ${newCode} (-${percent}%)`);

  const promo = new Promotion({
    code:          newCode,
    description:   `Mã xin sếp từ AI chat FB (-${percent}%)`,
    discountType:  'Percentage',
    discountValue: percent,
    maxDiscount:   500000,
    usageLimit:    1,
    usageCount:    0,
    status:        'Active',
    validFrom:     new Date(),
    validUntil:    new Date(Date.now() + 24 * 60 * 60 * 1000)
  });
  await promo.save();

  return `[HỆ_THỐNG_BÁO]: Sếp đã tạo mã THẬT ở database: "${newCode}" giảm ${percent}%. Hãy thông báo cho khách mã này và bảo họ chốt lẹ kẻo hết!`;
}

// ─────────────────────────────────────────────────────────────
// ACTION: CHỐT ĐƠN
// ─────────────────────────────────────────────────────────────

/**
 * Tạo đơn hàng, hợp đồng, invoice và trả về tin nhắn gửi thẳng cho khách.
 * @param {object}   aiAction
 * @param {object}   session
 * @param {string}   facebookId
 * @returns {string} - Tin nhắn cuối gửi cho khách (không qua AI nữa)
 */
async function handleCreateOrder(aiAction, session, facebookId) {
  // 1. Lấy / tạo User từ Facebook ID
const email = aiAction.email; 
  if (!email) {
    return '[HỆ_THỐNG_BÁO_LỖI]: Bạn chưa xin Email của khách hàng. Hãy khéo léo xin Email để gửi OTP ký hợp đồng ngay lập tức!';
  }
let user = await User.findOne({ email });
  let isReturningCustomer = false;
  let fullName = 'Khách hàng Facebook';

  if (user) {
    // KHÁCH HÀNG CŨ: Đã có tài khoản bằng Email này
    isReturningCustomer = true;
    fullName = user.fullName;
    // Nếu tài khoản này chưa từng liên kết FB, thì map luôn facebookId vào
    if (!user.facebookId) {
      user.facebookId = facebookId;
      await user.save();
    }
  } else {
    // KHÁCH HÀNG MỚI: Lấy tên từ FB và tạo tài khoản tạm
    try {
      const fbRes = await axios.get(
        `https://graph.facebook.com/${facebookId}?fields=first_name,last_name&access_token=${PAGE_ACCESS_TOKEN}`
      );
      if (fbRes.data) fullName = `${fbRes.data.last_name} ${fbRes.data.first_name}`.trim();
    } catch (e) {
      console.log('[CreateOrder] Lấy tên FB lỗi, dùng tên mặc định');
    }

    user = new User({ 
      facebookId, 
      email, // Đã có sẵn email từ bot
      provider: 'facebook', 
      fullName, 
      role: 'customer', 
      status: 'Pending_Password' // Trạng thái chờ đặt pass
    });
    await user.save();
  }

  if (!session.surveyDataCache) {
    throw new Error('Không có surveyDataCache — khách chưa tính giá.');
  }

  // 2. Chuẩn bị giá
  const priceCache     = session.calculatedPriceResult;
  const finalSubtotal  = priceCache?.subtotal   || 1500000;
  const finalTax       = priceCache?.tax        || 0;
  const finalTotalPrice = priceCache?.totalPrice || 1500000;
  const finalBreakdown  = priceCache?.breakdown || session.calculatedBreakdown || {
    baseTransportFee: finalTotalPrice,
    vehicleFee: 0, laborFee: 0, stairsFee: 0, packingFee: 0, assemblingFee: 0
  };

  // 3. Tạo RequestTicket
  const randomString = crypto.randomBytes(2).toString('hex').toUpperCase();
  const code         = `REQ-${new Date().getFullYear()}-${randomString}`;
  const parsedPrice  = parseInt((aiAction.final_price || '').replace(/\D/g, '')) || 1500000;

  const pricingDataObjectId = new mongoose.Types.ObjectId();
  const newTicket = new RequestTicket({
    code,
    customerId:    user._id,
    moveType:      'FULL_HOUSE',
    pickup:        session.surveyDataCache.pickup,
    delivery:      session.surveyDataCache.delivery,
    scheduledTime: session.surveyDataCache.scheduledTime,
    status:        'ACCEPTED',
    notes:         aiAction.notes || 'Chốt đơn tự động qua Facebook AI Bot',
    pricing: {
      subtotal:     finalSubtotal,
      totalPrice:   finalTotalPrice,
      tax:          finalTax,
      pricingDataId: pricingDataObjectId
    }
  });
  await newTicket.save();

  // 4. Tạo SurveyData
  const newSurvey = new SurveyData({
    requestTicketId:    newTicket._id,
    surveyType:         'ONLINE',
    status:             'COMPLETED',
    suggestedVehicle:   session.surveyDataCache.suggestedVehicle   || '500KG',
    suggestedStaffCount: session.surveyDataCache.suggestedStaffCount || 2,
    distanceKm:         session.surveyDataCache.distanceKm         || 0,
    carryMeter:         session.surveyDataCache.carryMeter         || 0,
    floors:             session.surveyDataCache.floors             || 0,
    hasElevator:        session.surveyDataCache.hasElevator        || false,
    needsAssembling:    session.surveyDataCache.needsAssembling    || false,
    needsPacking:       session.surveyDataCache.needsPacking       || false,
    items:              session.surveyDataCache.items              || [],
    totalActualWeight:  session.surveyDataCache.totalActualWeight  || 0,
    totalActualVolume:  session.surveyDataCache.totalActualVolume  || 0,
    estimatedHours:     session.surveyDataCache.estimatedHours     || 2
  });
  await newSurvey.save();

  // 5. Tạo PricingData
  let activePriceList = null;
  try {
    activePriceList = await PricingCalculationService.getActivePriceList();
  } catch (err) {
    console.warn('[CreateOrder] Không tìm thấy PriceList active, dùng ID ảo');
  }

  const newPricing = new PricingData({
    _id:             pricingDataObjectId,
    requestTicketId: newTicket._id,
    surveyDataId:    newSurvey._id,
    priceListId:     activePriceList ? activePriceList._id : new mongoose.Types.ObjectId(),
    totalPrice:      finalTotalPrice,
    subtotal:        finalSubtotal,
    tax:             finalTax,
    breakdown:       finalBreakdown
  });
  await newPricing.save();

  // 6. Tạo Contract
  let template = await ContractTemplate.findOne({ isActive: true });
  let finalContent = 'Nội dung hợp đồng đang được cập nhật...';

  if (template?.content) {
    finalContent = template.content
      .replace(/\$\{customerName\}/g,  fullName)
      .replace(/\$\{customerPhone\}/g, 'Sẽ cập nhật sau')
      .replace(/\$\{totalPrice\}/g,    parsedPrice.toLocaleString('vi-VN'));
  } else {
    console.warn('⚠️ Không có Contract Template nào Active trong DB!');
  }

  const contractNumber = `HĐ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const newContract = new Contract({
    contractNumber,
    templateId:      template ? template._id : null,
    requestTicketId: newTicket._id,
    customerId:      user._id,
    content:         finalContent,
    status:          'DRAFT'
  });
  await newContract.save();

  // 7. Tạo Invoice
  try {
    await InvoiceService.createInvoiceFromTicket(newTicket._id);
  } catch (invErr) {
    console.error('[CreateOrder] Lỗi tạo Invoice:', invErr.message);
  }

  // 8. Hủy mã khuyến mãi nếu có dùng
  if (aiAction.discount_code && aiAction.discount_code !== 'NONE') {
    await Promotion.findOneAndUpdate(
      { code: aiAction.discount_code },
      { status: 'Expired', $inc: { usageCount: 1 } }
    );
  }

  // 9. Build tin nhắn gửi khách
  const FE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  if (isReturningCustomer) {
    const directLink = `${FE_URL}/login?redirect=/customer/sign-contract/${newTicket._id}`;
    return (
      `Dạ mừng anh/chị đã quay lại sử dụng dịch vụ HOMS! 🎉\n\n` +
      `Hợp đồng mới đã được tạo dựa trên email ${email}. Anh/chị truy cập link dưới đây, ` +
      `đăng nhập bằng mật khẩu cũ để tiến hành ký hợp đồng nhé:\n👉 ${directLink}`
    );
  }
  const setupToken = jwt.sign(
    { id: user._id, facebookId, fullName, type: 'setup_account' },
    process.env.JWT_SECRET || 'SECRET',
    { expiresIn: '1d' }
  );
  const magicLink = `${FE_URL}/magic?token=${setupToken}&redirect=/customer/sign-contract/${newTicket._id}`;
  return (
    `Dạ em đã lên hồ sơ hợp đồng xong rồi ạ! 🎉\n\n` +
    `Để bảo mật thông tin, anh/chị vui lòng nhấn vào link dưới đây để thiết lập mật khẩu ` +
    `và tiến hành ký hợp đồng nhé:\n👉 ${magicLink}`
  );
}

module.exports = { handleCalculatePrice, handleRequestDiscount, handleCreateOrder };