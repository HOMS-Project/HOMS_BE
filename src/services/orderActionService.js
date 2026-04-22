const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const GeocodeService = require('./geocodeService');
const PricingCalculationService = require('./pricingCalculationService');
const RouteValidationService = require('./routeValidationService');
const SurveyData = require('../models/SurveyData');
const PricingData = require('../models/PricingData');
const Promotion = require('../models/Promotion');
const RequestTicket = require('../models/RequestTicket');
const AutoAssignmentService = require('./AutoAssignmentService')
const SurveyService = require('./surveyService');
const GOONG_API_KEY = process.env.GOONG_API_KEY;
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


  let suggestedVehicle = '1TON'; 
  let suggestedStaffCount = 1;
  let finalActualWeight = 0;
  let finalActualVolume = 0;
  let routeWarnings = [];
const ITEM_DICTIONARY = {
  "tủ lạnh": { weight: 60, volume: 0.8 },
  "tủ lạnh 4 cánh": { weight: 120, volume: 1.5 },
  "máy giặt": { weight: 40, volume: 0.4 },
  "giường": { weight: 50, volume: 1.0 },
  "nệm": { weight: 20, volume: 1.2 },
  "tủ quần áo": { weight: 80, volume: 2.0 },
  "sofa": { weight: 60, volume: 1.5 },
  "thùng carton": { weight: 15, volume: 0.1 },
  "xe máy": { weight: 100, volume: 1.0 }
};

  let rawItems = [...(session.visionItems || []), ...(data.items || [])];
let finalItems = rawItems.map(item => {
  let itemName = (item.name || '').toLowerCase();
  
  let matchedRule = Object.keys(ITEM_DICTIONARY).find(key => itemName.includes(key));
  let defaultWeight = matchedRule ? ITEM_DICTIONARY[matchedRule].weight : 20;
  let defaultVolume = matchedRule ? ITEM_DICTIONARY[matchedRule].volume : 0.2;

  const weight = Number(item.actualWeight) > 0 ? Number(item.actualWeight) : defaultWeight; 
  const volume = Number(item.actualVolume) > 0 ? Number(item.actualVolume) : defaultVolume;
  
  return {
    name: item.name || 'Đồ đạc',
    quantity: Number(item.quantity) || 1,
    actualWeight: weight * (Number(item.quantity) || 1), 
    actualVolume: volume * (Number(item.quantity) || 1)
  };
});
   let totalCalculatedWeight = finalItems.reduce((sum, item) => sum + item.actualWeight, 0);
  let totalCalculatedVolume = finalItems.reduce((sum, item) => sum + item.actualVolume, 0);
   if (moveType === 'FULL_HOUSE') {
    if (totalCalculatedWeight < 300) totalCalculatedWeight = 300;
    if (totalCalculatedVolume < 3) totalCalculatedVolume = 3;
  }
  const floors = Number(data.floors) || 0;

  if (moveType === 'TRUCK_RENTAL') {
  
    suggestedVehicle = data.suggestedVehicle || '1TON';
    suggestedStaffCount = Number(data.suggestedStaffCount) || 1; 
  } else {
  
    const estimation = await SurveyService.estimateResources(
      finalItems, distanceKm, floors, data.hasElevator
    );
    suggestedVehicle = estimation.suggestedVehicle;
    suggestedStaffCount = estimation.suggestedStaffCount;
    finalActualWeight = Number(data.totalWeight) > 0 ? Number(data.totalWeight) : estimation.totalWeight;
    finalActualVolume = estimation.totalVolume;
    routeWarnings = estimation.routeWarnings || [];
  }

  // 4. Validate lộ trình (Cấm tải, khung giờ)
  const routeValidation = await RouteValidationService.validateRoute(null, {
    vehicleType: suggestedVehicle,
    totalWeight: finalActualWeight,
    totalVolume: finalActualVolume,
    pickupTime,
    pickupAddress:  data.from,
    deliveryAddress: data.to
  });


  const surveyData = {
    movingType: moveType,
    pickup: { address: data.from, coordinates: fromCoords, district: pickupDistrict },
    delivery: { address: data.to, coordinates: toCoords, district: deliveryDistrict },
    distanceKm,
    carryMeter: Number(data.carryMeter) || 0,
    floors,
    hasElevator: data.hasElevator || false,
    needsAssembling: data.needsAssembling || false,
    needsPacking: data.needsPacking || false,
    items: finalItems,
    scheduledTime: pickupTime,
    

    suggestedVehicle,
    suggestedStaffCount,
    rentalDurationHours: Number(data.rentalDurationHours) || 1, 
    estimatedHours: Number(data.rentalDurationHours) || undefined,
    
    totalActualWeight: finalActualWeight,
    totalActualVolume: finalActualVolume,
    insuranceRequired: false,
    declaredValue: 0
  };

  
  session.surveyDataCache = surveyData;

  let finalPrice = 0;
  try {

    const priceList = await PricingCalculationService.getActivePriceList();
    if (!priceList) throw new Error('Không có bảng giá active');


    const priceResult = await PricingCalculationService.calculatePricing(
      surveyData,
      priceList,
      moveType
    );

    finalPrice = priceResult.totalPrice;
    session.calculatedPriceResult = priceResult;
    session.calculatedBreakdown   = priceResult.breakdown;
  } catch (pricingErr) {
    console.error('[Pricing Error]', pricingErr.message);
    session.calculatedBreakdown = null;
    return `[HỆ_THỐNG_BÁO_LỖI]: Lỗi hệ thống tính giá (${pricingErr.message}). Xin lỗi khách và báo kỹ thuật.`;
  }

  // 7. Cảnh báo lộ trình
  let routeAlertMsg = '';
  if (routeWarnings && routeWarnings.length > 0) {
    routeAlertMsg += `\n[LƯU Ý XE]: ${routeWarnings.join(' ')}`;
  }
  if (routeValidation && routeValidation.violations?.length > 0) {
    routeAlertMsg += `\n[VI PHẠM QUY ĐỊNH]: ${routeValidation.violations.join(' | ')}. Báo khách hàng khung giờ này cấm tải hoặc xe không vào được, đề nghị đổi giờ.`;
  }

 if (moveType === 'TRUCK_RENTAL') {
    return (
      `[GIÁ_THỰC_TẾ_TỪ_HỆ_THỐNG]: Mức giá TẠM TÍNH cho dịch vụ Thuê xe tải là ${finalPrice.toLocaleString('vi-VN')} VNĐ (Khoảng cách: ${distanceKm}km).${routeAlertMsg}\n\n` +
      `Hãy báo giá này cho khách một cách tự nhiên. Dặn khách đây là giá thuê xe tạm tính, khi chốt đơn bộ phận điều phối sẽ gọi lại để chốt chính xác thời gian và xác nhận loại xe phù hợp ạ.`
    );
  } else {
    return (
      `[GIÁ_THỰC_TẾ_TỪ_HỆ_THỐNG]: Dựa trên hình ảnh và mô tả, mức giá TẠM TÍNH là ${finalPrice.toLocaleString('vi-VN')} VNĐ (Khoảng cách: ${distanceKm}km).${routeAlertMsg}\n\n` +
      `Hãy báo giá này cho khách và nói rõ: "Dạ đây là chi phí tạm tính dựa trên đồ đạc anh/chị cung cấp. Khi anh/chị chốt đơn, điều phối viên bên em sẽ gọi lại chốt danh sách đồ chính xác 1 lần nữa để đảm bảo không phát sinh phí cho mình ạ!".`
    );
  }
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
 const extractedEmail = aiAction.email || (aiAction.data && aiAction.data.email) || '';  
const rawEmailText = extractedEmail.toLowerCase(); 

const emailMatch = rawEmailText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
const email = emailMatch ? emailMatch[0] : null;
 console.log('Email nhận được từ AI:', extractedEmail, '-> Email sau khi RegEx:', email);
console.log(email);
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
 let finalSubtotal   = priceCache?.subtotal    || 1500000;
let finalTax        = priceCache?.tax         || 0;
let finalTotalPrice = priceCache?.totalPrice  || 1500000;
let finalBreakdown  = priceCache?.breakdown   || session.calculatedBreakdown || {
  baseTransportFee: finalTotalPrice, vehicleFee: 0, laborFee: 0,
  stairsFee: 0, packingFee: 0, assemblingFee: 0
};
  let appliedPromo = null;
  let discountAmount = 0;
  if (aiAction.discount_code && aiAction.discount_code !== 'NONE') {
    appliedPromo = await Promotion.findOne({
      code: aiAction.discount_code,
      status: 'Active',
      $expr: { $lt: ["$usageCount", "$usageLimit"] }
    });

    if (appliedPromo) {
      if (appliedPromo.discountType === 'Percentage') {
        discountAmount = (finalSubtotal * appliedPromo.discountValue) / 100;
      } else {
        discountAmount = appliedPromo.discountValue;
      }
      if (appliedPromo.maxDiscount && discountAmount > appliedPromo.maxDiscount) {
        discountAmount = appliedPromo.maxDiscount;
      }

      finalTotalPrice = finalTotalPrice - discountAmount;
      if (finalTotalPrice < 0) finalTotalPrice = 0; 

      finalBreakdown.discountAmount = discountAmount;
      finalBreakdown.promotionCode = aiAction.discount_code;
    } else {
      return `[HỆ_THỐNG_BÁO]: Mã khuyến mãi "${aiAction.discount_code}" không tồn tại hoặc đã hết lượt. Anh/chị vui lòng kiểm tra lại.`;
    }
  }

  const actualMoveType = session.surveyDataCache.movingType;
  const pricingDataObjectId = new mongoose.Types.ObjectId();
  const randomString = crypto.randomBytes(2).toString('hex').toUpperCase();
  const code = `REQ-${new Date().getFullYear()}-${randomString}`;

  const ticketStatus = 'WAITING_REVIEW'; 
  const ticketNotes = `[TẠO TỪ AI BOT - GỬI QUOTED CHO KHÁCH] ${aiAction.notes || ''}`;

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
      pricing: { subtotal: finalSubtotal, totalPrice: finalTotalPrice, tax: finalTax, discountAmount: discountAmount,promotionCode: aiAction.discount_code || null, pricingDataId: pricingDataObjectId }
    });
    const assignedDispatcherId = await AutoAssignmentService.assignDispatcher(newTicket);
    if (assignedDispatcherId) {
    newTicket.dispatcherId = assignedDispatcherId;
    newTicket.status = 'WAITING_REVIEW';
} else {
    newTicket.status = 'PENDING_ASSIGNMENT';
}
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
if (appliedPromo) {
      const updatedPromo = await Promotion.findOneAndUpdate(
        { _id: appliedPromo._id },
        { $inc: { usageCount: 1 } }, 
        { new: true, session: dbSession }
      );

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
  delete session.surveyDataCache;
  delete session.calculatedPriceResult;
  // ─────────────────────────────────────────────────────────────
  // BƯỚC 4: SINH LINK VÀ TIN NHẮN TRẢ VỀ
  // ─────────────────────────────────────────────────────────────
  const FE_URL = process.env.FRONTEND_URL ;
 const targetPath = `/customer/order`; 
if (isReturningCustomer) {
    let redirectPath = targetPath + `/${newTicket._id}`;
    if (isUnverifiedClaim) {
      redirectPath += `?link_fb=${facebookId}`; 
    }
    const directLink = `${FE_URL}/login?redirect=${encodeURIComponent(redirectPath)}`;
    let msg = `Dạ hệ thống đã ghi nhận đơn hàng của anh/chị với mức giá TẠM TÍNH là ${finalTotalPrice.toLocaleString()}đ ✅\n\n`;
msg += `Để đảm bảo không phát sinh bất kỳ chi phí nào, nhân viên điều phối của HOMS sẽ liên hệ với anh/chị trên trang web để chốt chính xác danh sách đồ.\n`;
msg += `Anh/chị có thể xem trước chi tiết lộ trình tại đây: 👉 ${directLink}`;
    return msg;

  } else {
    // Khách mới
    const setupToken = jwt.sign(
      { id: user._id, facebookId, email, fullName, type: 'setup_account' },
      process.env.JWT_SECRET || 'SECRET',
      { expiresIn: '1d' }
    );
    const magicLink = `${FE_URL}/magic?token=${setupToken}&redirect=${encodeURIComponent(targetPath + `/${newTicket._id}`)}`;
    return (
      `Dạ em đã tạo báo giá tạm tính cho anh/chị xong rồi ạ! 🎉\n\n` +
      `Hãy click vào link dưới đây để thiết lập mật khẩu và xem chi tiết đơn hàng nhé:\n👉 ${magicLink}\n\n` +
      `Anh/chị vui lòng chờ nhân viên bên tụi em xác nhận lại đồ đạc vì AI đôi khi sai sót không đảm bảo 100%, nên giá cả có thể sẽ thay đổi, xin anh/chị thông cảm !`
    );
  }
}
module.exports = { handleCalculatePrice, handleRequestDiscount, handleCreateOrder };