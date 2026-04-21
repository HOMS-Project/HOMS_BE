const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const ContractTemplate = require('../models/ContractTemplate');
const InvoiceService = require('./invoiceService');
const GeocodeService = require('./geocodeService');
const PricingCalculationService = require('./pricingCalculationService');
const RouteValidationService = require('./routeValidationService');
const SurveyService = require('./surveyService');
const SurveyData = require('../models/SurveyData');
const PricingData = require('../models/PricingData');
const Promotion = require('../models/Promotion');
const RequestTicket = require('../models/RequestTicket');
const ContractService = require('../services/admin/contractService'); 
const RecommendationService = require('./recommendationService');
const PricingAdjustmentService = require('./pricingAdjustmentService');
const GOONG_API_KEY = process.env.GOONG_API_KEY;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const MAX_AI_DISCOUNT_PERCENT = 15; 
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
      params: { address: searchAddress, api_key: GOONG_API_KEY },
       timeout: 5000
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


function computeEstimatedHours({ distanceKm = 0, floors = 0, suggestedStaffCount = 2, moveType }) {
  let hours = 2;
  
  if (moveType === 'TRUCK_RENTAL' || moveType === 'SPECIFIC_ITEMS') {
    hours = 1; 
  }

  hours += distanceKm * 0.1;

  if (moveType === 'FULL_HOUSE') {
    hours += floors * 0.5;
    if (suggestedStaffCount <= 2) hours += 1;
  }
  
  return Math.ceil(hours);
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
  const moveType = aiAction.movingType || 'FULL_HOUSE'; 
  if (!data.from || !data.to || data.from === 'địa chỉ đi') {
    return '[HỆ_THỐNG_BÁO_LỖI]: Bạn chưa lấy đủ địa chỉ ĐI và ĐẾN chi tiết. Hãy khéo léo xin lỗi và hỏi lại khách hàng ngay lập tức!';
  }
 if (!data.movingTime) {
    return '[HỆ_THỐNG_BÁO_LỖI]: Thiếu thông tin thời gian chuyển. Hãy hỏi khách hàng muốn chuyển vào ngày giờ nào để kiểm tra kẹt xe/cấm tải.';
  }
    let pickupTime = new Date(data.movingTime);
  if (isNaN(pickupTime.getTime()) || pickupTime < new Date(Date.now() - 3600000)) {
    return '[HỆ_THỐNG_BÁO_LỖI]: Thời gian chuyển không hợp lệ hoặc nằm trong quá khứ. Xin hãy xác nhận lại thời gian chính xác với khách.';
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
  if (data.movingTime) {
    const parsed = new Date(data.movingTime);
    if (!isNaN(parsed.getTime())) pickupTime = parsed;
  }

  // 4. Xe & nhân viên qua Estimate Resources Engine
  const finalItems = (session.visionItems && session.visionItems.length > 0)
    ? session.visionItems
    : (data.items || []);
  const floors = Number(data.floors) || 0;
  const carryMeter = Number(data.carryMeter) || 0;
  const hasElevator = data.hasElevator || false;
  const needsAssembling = data.needsAssembling || false;
  const needsPacking = data.needsPacking || false;

  const resourceEstimate = await SurveyService.estimateResources({
    items: finalItems,
    distanceKm,
    floors,
    hasElevator,
    carryMeter,
    needsAssembling,
    needsPacking
  });

  const tempVehicleType = resourceEstimate.suggestedVehicle;
  const tempStaffCount = resourceEstimate.suggestedStaffCount;
  const vol = resourceEstimate.totalVolume || session.visionVolume || 1;
  const wgt = resourceEstimate.totalWeight || session.visionWeight || 100;
  const estimatedHours = Math.ceil((resourceEstimate.estimatedMinutes || computeEstimatedHours({ distanceKm, floors, suggestedStaffCount: tempStaffCount }) * 60) / 60);

  // Ghi log lý do ước tính để debug (ẩn với user)
  console.log('[AI Resource Estimation]:', JSON.stringify({ ...resourceEstimate, debug: undefined }, null, 2));

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
  const surveyData = {
     movingType: moveType,
    pickup:           { address: data.from,  coordinates: fromCoords,  district: pickupDistrict },
    delivery:         { address: data.to,    coordinates: toCoords,    district: deliveryDistrict },
    distanceKm,
    carryMeter,
    floors,
    hasElevator,
    needsAssembling,
    needsPacking,
    items:            finalItems,
    scheduledTime:    pickupTime,
    suggestedVehicle: tempVehicleType,
    suggestedStaffCount: tempStaffCount,
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
    const priceList = await PricingCalculationService.getActivePriceList();
    const basePricing = await PricingCalculationService.calculatePricing(surveyData, priceList, moveType);  
    let recommendation = null;
    try {
      const location = data.from || 'Đà Nẵng';
      recommendation = await RecommendationService.getRecommendations(pickupTime, location, distanceKm);
    } catch (recError) {
      console.error('Recommendation Error:', recError.message);
    }
    const priceResult = recommendation 
      ? await PricingAdjustmentService.applyAdjustments(basePricing, recommendation)
      : basePricing;

    finalPrice                    = priceResult.totalPrice;
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
 * Tạo đơn hàng,  trả về tin nhắn gửi thẳng cho khách.
 * @param {object}   aiAction
 * @param {object}   session
 * @param {string}   facebookId
 * @returns {string} - Tin nhắn cuối gửi cho khách (không qua AI nữa)
 */
async function handleCreateOrder(aiAction, session, facebookId) {
  const rawEmailText = aiAction.email?.toLowerCase() || '';

 
  const emailMatch = rawEmailText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  
  const email = emailMatch ? emailMatch[0] : null;


  if (!email) {
    return '[HỆ_THỐNG_BÁO_LỖI]: Email không hợp lệ hoặc chưa được cung cấp. Hãy xin lại email chính xác từ khách hàng!';
  }

   if (!session.surveyDataCache) {
    throw new Error('Không có dữ liệu tính giá — Vui lòng báo khách hàng tính giá trước khi chốt đơn.');
  }
  let isReturningCustomer = false;
  let fullName = 'Khách hàng Facebook';
  let user = null;
  let isUnverifiedClaim = false; 
  let needToUpdateUser = false; 

  const userByFb = await User.findOne({ facebookId });
  const userByEmail = await User.findOne({ email });

  if (userByFb && userByEmail) {
    if (userByFb._id.toString() !== userByEmail._id.toString()) {
      // Trường hợp: FB này đang thuộc User A, nhưng email lại thuộc User B
      // Đây là lỗi xung đột dữ liệu. Nên ưu tiên User theo Facebook (người đang chat)
      // hoặc thông báo khách là email này đã được sử dụng bởi người khác.
      return `[HỆ_THỐNG_BÁO]: Email ${email} đã được đăng ký bởi một tài khoản khác. Vui lòng liên hệ hỗ trợ hoặc sử dụng email khác.`;
    }
    user = userByFb; // Cả 2 là 1
  } else if (userByFb) {
    // FB đã tồn tại, cập nhật email mới cho nó
    user = userByFb;
    user.email = email;
    needToUpdateUser = true;
  } else if (userByEmail) {
    // FB mới tinh, nhưng email đã tồn tại -> Đây là khách cũ dùng email cũ
    user = userByEmail;
    // Vì FB này chưa gắn vào user này, ta đánh dấu là Unverified
    isUnverifiedClaim = true; 
  } else {
    // Khách mới hoàn toàn
    user = new User({ 
      facebookId, 
      email, 
      provider: 'facebook', 
      fullName: 'Khách hàng', // Lấy từ FB Graph sau
      role: 'customer', 
      status: 'Pending_Password'
    });
    needToUpdateUser = true;
  }

  isReturningCustomer = !!user.password;
  fullName = user.fullName;

  // ─────────────────────────────────────────────────────────────
  // BƯỚC 2: CHUẨN BỊ DỮ LIỆU ĐỌC 
  // ─────────────────────────────────────────────────────────────
  const priceCache = session.calculatedPriceResult;
  const finalSubtotal = priceCache?.subtotal || 1500000;
  const finalTax = priceCache?.tax || 0;
  const finalTotalPrice = priceCache?.totalPrice || 1500000;
  const finalBreakdown = priceCache?.breakdown || session.calculatedBreakdown || {
    baseTransportFee: finalTotalPrice, vehicleFee: 0, laborFee: 0, stairsFee: 0, packingFee: 0, assemblingFee: 0
  };

  const actualMoveType = session.surveyDataCache.movingType;
  const pricingDataObjectId = new mongoose.Types.ObjectId();
  const randomString = crypto.randomBytes(2).toString('hex').toUpperCase();
  const code = `REQ-${new Date().getFullYear()}-${randomString}`;

  const ticketStatus = 'WAITING_REVIEW'; 
  const ticketNotes = `[TẠO TỪ AI BOT - CẦN DISPATCHER KIỂM TRA LẠI DỮ LIỆU] ${aiAction.notes || ''}`;

  let activePriceList = await PricingCalculationService.getActivePriceList().catch(() => null);

  // ─────────────────────────────────────────────────────────────
  // BƯỚC 3: DATABASE TRANSACTION (Chỉ chứa các lệnh GHI - WRITE)
  // ─────────────────────────────────────────────────────────────
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  let newTicket; 

  try {
    // 1. Lưu User mới hoặc User đổi email
    if (needToUpdateUser) {
      await user.save({ session: dbSession });
    }

    // 2. Tạo RequestTicket
     newTicket = new RequestTicket({
      code,
      customerId: user._id,
      moveType: actualMoveType,
      pickup: session.surveyDataCache.pickup,
      delivery: session.surveyDataCache.delivery,
      scheduledTime: session.surveyDataCache.scheduledTime,
      status: ticketStatus, 
      notes: ticketNotes,
      pricing: { subtotal: finalSubtotal, totalPrice: finalTotalPrice, tax: finalTax, pricingDataId: pricingDataObjectId }
    });
    await newTicket.save({ session: dbSession });

    // 3. Tạo SurveyData
    const newSurvey = new SurveyData({
      requestTicketId: newTicket._id,
      surveyType: 'ONLINE',
      status: 'COMPLETED',
      ...session.surveyDataCache 
    });
    await newSurvey.save({ session: dbSession });

    // 4. Tạo PricingData
     const newPricing = new PricingData({
      _id: pricingDataObjectId,
      requestTicketId: newTicket._id,
      surveyDataId: newSurvey._id,
      priceListId: activePriceList ? activePriceList._id : new mongoose.Types.ObjectId(),
      totalPrice: finalTotalPrice,
      subtotal: finalSubtotal,
      tax: finalTax,
      breakdown: finalBreakdown,
      dynamicAdjustment: priceCache?.dynamicAdjustment || null
    });
    await newPricing.save({ session: dbSession });

    // 6. Cập nhật Mã khuyến mãi (Bảo mật Race Condition bằng $inc và $expr)
    if (aiAction.discount_code && aiAction.discount_code !== 'NONE') {
      const updatedPromo = await Promotion.findOneAndUpdate(
        { 
          code: aiAction.discount_code, 
          status: 'Active',
          $expr: { $lt: ["$usageCount", "$usageLimit"] } // Đảm bảo chưa vượt limit
        },
        { $inc: { usageCount: 1 } }, 
        { new: true, session: dbSession }
      );
 if (!updatedPromo) {
        throw new Error(`[HỆ_THỐNG_BÁO]: Mã khuyến mãi "${aiAction.discount_code}" không hợp lệ hoặc đã hết lượt sử dụng. Mong khách hàng thông cảm!`);
      }

      if (updatedPromo && updatedPromo.usageCount >= updatedPromo.usageLimit) {
        updatedPromo.status = 'Expired';
        await updatedPromo.save({ session: dbSession });
      }
    }

    // COMMIT
    await dbSession.commitTransaction();

  } catch (error) {
    // ROLLBACK
    await dbSession.abortTransaction();
    console.error('[CreateOrder] Transaction Error:', error);
     throw new Error(error.message || 'Lỗi hệ thống khi tạo đơn hàng, đã hủy thay đổi.');
  } finally {
    dbSession.endSession();
  }

  try {
    await InvoiceService.createInvoiceFromTicket(newTicket._id);
  } catch (invErr) {
    console.error('[CreateOrder] Lỗi tạo Invoice:', invErr.message);
  }
  delete session.surveyDataCache;
  delete session.calculatedPriceResult;
  // ─────────────────────────────────────────────────────────────
  // BƯỚC 4: SINH LINK VÀ TIN NHẮN TRẢ VỀ
  // ─────────────────────────────────────────────────────────────
  const FE_URL = process.env.FRONTEND_URL ;
 const targetPath = `/customer/order`; 
if (isReturningCustomer) {
    let redirectPath = targetPath;
    if (isUnverifiedClaim) {
      redirectPath += `?link_fb=${facebookId}`; 
    }
    const directLink = `${FE_URL}/login?redirect=${encodeURIComponent(redirectPath)}`;
        let msg = `Dạ em thấy email ${email} đã có tài khoản trên hệ thống HOMS!\n\n`;
    msg += `Hồ sơ yêu cầu của anh/chị đã được AI tạo xong. Tuy nhiên để đảm bảo tính chính xác 100%, **Trưởng bộ phận điều phối (Dispatcher) bên em sẽ kiểm tra lại khối lượng đồ đạc một chút và chốt lại đơn chính thức cho mình trong vài phút tới nhé!**\n\n`;
    msg += `Anh/chị vui lòng truy cập link dưới đây để đăng nhập và theo dõi tiến độ đơn hàng ạ:\n👉 ${directLink}`;
    return msg;

  } else {
    // Khách mới
    const setupToken = jwt.sign(
      { id: user._id, facebookId, email, fullName, type: 'setup_account' },
      process.env.JWT_SECRET || 'SECRET',
      { expiresIn: '1d' }
    );
    const magicLink = `${FE_URL}/magic?token=${setupToken}&redirect=${encodeURIComponent(targetPath)}`;
    return (
      `Dạ em đã lên hồ sơ hệ thống xong rồi ạ! 🎉\n\n` +
      `Vì AI ước lượng đồ đôi khi có sai số, **Đội ngũ điều phối viên bên em sẽ double-check lại lộ trình và chốt đơn chính thức cho mình ngay lập tức ạ.**\n\n` +
      `Đây là lần đầu anh/chị dùng HOMS, hãy click vào link dưới đây để thiết lập mật khẩu bảo mật và theo dõi tiến độ duyệt đơn nhé:\n👉 ${magicLink}`
    );
  }
}
module.exports = { handleCalculatePrice, handleRequestDiscount, handleCreateOrder };