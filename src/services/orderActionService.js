const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const GeocodeService = require('./geocodeService');
const PricingCalculationService = require('./pricingCalculationService');
const RouteValidationService = require('./routeValidationService');
const SurveyService = require('./surveyService');
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

/** Tính thời gian ước tính cho đơn hàng */
async function computeEstimatedHours({ distanceKm = 0, floors = 0, suggestedStaffCount = 2, moveType }) {
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
  const pickupTime = new Date(data.movingTime);
  const now = new Date();

  // 1. Kiểm tra nếu AI không chuyển đổi được thời gian (trả về chữ hoặc sai format)
  if (isNaN(pickupTime.getTime())) {
    return '[HỆ_THỐNG_BÁO_LỖI]: AI chưa chuyển được thời gian sang dạng ngày tháng cụ thể. Bạn BẮT BUỘC phải yêu cầu khách cung cấp lại ngày dương lịch chính xác (ví dụ: ngày 28/04/2026).';
  }

  // 2. Kiểm tra nếu chọn giờ quá khứ (Cho phép du di 1 tiếng - 3600000ms)
  if (pickupTime < new Date(now.getTime() - 3600000)) {
    return '[HỆ_THỐNG_BÁO_LỖI]: Thời gian chuyển không hợp lệ vì nằm trong quá khứ. Hãy nhờ khách cho ngày cụ thể ở TƯƠNG LAI (Ví dụ: 25/04/2026).';
  }

  console.log('🔄 Đang tính giá bằng API thật...', data);

  // 1. Lấy tọa độ
  const fromCoords = await getCoordinates(data.from);
  const toCoords = await getCoordinates(data.to);
  if (!fromCoords || !toCoords) {
    return '[HỆ_THỐNG_BÁO_LỖI]: Không tìm thấy địa chỉ này trên bản đồ Đà Nẵng. Nhờ khách kiểm tra lại tên đường/quận.';
  }

  // 2. Khoảng cách & quận
  const distanceKm = await getRouteDistance(fromCoords, toCoords);
  const pickupDistrict = await GeocodeService.reverseGeocode(fromCoords.lat, fromCoords.lng);
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
  const estimatedHours = await computeEstimatedHours({ distanceKm, floors, suggestedStaffCount, moveType });
  const routeValidation = await RouteValidationService.validateRoute(null, {
    vehicleType: suggestedVehicle,
    totalWeight: finalActualWeight,
    totalVolume: finalActualVolume,
    pickupTime,
    pickupAddress: data.from,
    deliveryAddress: data.to
  });
  const existingImages = session.surveyDataCache?.images || [];
  const surveyData = {
    movingType: moveType,
    images: existingImages,
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
    estimatedHours: Number(data.rentalDurationHours) || estimatedHours,

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
    session.calculatedBreakdown = priceResult.breakdown;
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

  const lowPrice = finalPrice - 500000;
  const highPrice = finalPrice + 500000;
  if (moveType === 'TRUCK_RENTAL') {
    return (
      `[GIÁ_THỰC_TẾ_TỪ_HỆ_THỐNG]: Mức giá TẠM TÍNH cho dịch vụ Thuê xe tải dự kiến rơi vào khoảng từ ${lowPrice.toLocaleString()} VNĐ đến ${highPrice.toLocaleString()} VNĐ (Khoảng cách: ${distanceKm}km).${routeAlertMsg}\n\n` +
      `Hãy báo giá này cho khách một cách tự nhiên. Dặn khách đây là giá thuê xe tạm tính, khi chốt đơn bộ phận điều phối sẽ gọi lại để chốt chính xác thời gian và xác nhận loại xe phù hợp ạ.`
    );
  } else {
    return (
      `[GIÁ_THỰC_TẾ_TỪ_HỆ_THỐNG]: Dựa trên hình ảnh và mô tả, mức giá TẠM TÍNH  dự kiến rơi vào khoảng từ ${lowPrice.toLocaleString()} VNĐ đến ${highPrice.toLocaleString()} VNĐ  (Khoảng cách: ${distanceKm}km).${routeAlertMsg}\n\n` +
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
async function checkAvailablePromotions() {
  const now = new Date();
  return await Promotion.find({
    status: 'Active',
    validFrom: { $lte: now },
    validUntil: { $gte: now }
  }).limit(3); // Lấy tối đa 3 mã để gợi ý
}

async function handleRequestDiscount(aiAction) {
  const activePromos = await checkAvailablePromotions();

  if (activePromos && activePromos.length > 0) {
    const promoList = activePromos.map(p => `"${p.code}"`).join(', ');

    return (
      `[HỆ_THỐNG_TRẢ_VỀ_MÃ_KHUYẾN_MÃI]: Hệ thống tìm thấy các mã sau đang khả dụng: ${promoList}. \n` +
      `Hãy báo cho khách hàng biết để lưu lại mã này. ĐỒNG THỜI BẮT BUỘC DẶN KHÁCH: "AI không thể tự trừ tiền, anh/chị chốt đơn xong hãy nhấp vào link website em gửi để TỰ NHẬP MÃ vào đơn hàng nhé!".`
    );
  } else {
    return (
      `[HỆ_THỐNG_TRẢ_VỀ_MÃ_KHUYẾN_MÃI]: Hiện tại không có mã khuyến mãi nào khả dụng.\n` +
      `Hãy xin lỗi khách hàng, và khuyên khách "Theo dõi" (Follow) Fanpage HOMS bật thông báo để là người đầu tiên biết khi có mã giảm giá mới.`
    );
  }
}

async function generateMagicLinkForUser(facebookId, orderId = null) {
  const user = await User.findOne({ facebookId });
  if (!user) return null;

  const targetPath = orderId ? `/customer/order` : '/customer';

  const setupToken = jwt.sign(
    {
      id: user._id,
      facebookId: user.facebookId,
      st: user.securityToken,
      email: user.email,
      phone: user.phone,
      type: 'setup_account'
    },
    process.env.JWT_SECRET || 'SECRET',
    { expiresIn: '10m' }
  );

  return `${process.env.FRONTEND_URL}/magic?token=${setupToken}&redirect=${encodeURIComponent(targetPath)}`;
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
  const phone = aiAction.phone || (aiAction.data && aiAction.data.phone);
  const phoneRegex = /^[0-9]{10,11}$/;

  if (!phone || !phoneRegex.test(phone)) {
    return '[HỆ_THỐNG_BÁO_LỖI]: Bạn chưa có số điện thoại hợp lệ của khách. Hãy yêu cầu khách cung cấp số điện thoại (10-11 chữ số) để tiện liên lạc ạ.';
  }
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

  const psid = facebookId;

  const userByFb = await User.findOne({ messengerId: psid });
  const userByEmail = await User.findOne({ email });
  let isReturningCustomer = false;
  let fullName = 'Khách hàng Facebook';
  let user = null;
  let isUnverifiedClaim = false;
  let needToUpdateUser = false;

  if (userByFb && userByEmail) {
    if (userByFb._id.toString() !== userByEmail._id.toString()) {
      // Trường hợp: FB này đang thuộc User A, nhưng email lại thuộc User B
      return `[HỆ_THỐNG_BÁO]: Email ${email} đã được đăng ký bởi một tài khoản khác. Anh/chị vui lòng kiểm tra lại hoặc sử dụng email khác.`;
    }
    // FB và Email đều cùng của 1 User
    user = userByFb;
    // Bổ sung: Nếu user cũ chưa có số điện thoại, tiến hành cập nhật luôn
    if (!user.phone && phone) {
      user.phone = phone;
      needToUpdateUser = true;
    }
  } else if (userByFb) {
    // Trường hợp: Đã có FB, nhưng email này là mới (chưa ai dùng)
    user = userByFb;
    user.email = email; // Cập nhật email mới

    // Cập nhật sđt nếu trước đó chưa có
    if (!user.phone && phone) {
      user.phone = phone;
    }
    needToUpdateUser = true;
  } else if (userByEmail) {
    // Trường hợp: Email đã có trong hệ thống, nhưng nick FB này là nick lạ
    user = userByEmail;
    isUnverifiedClaim = true;
    // KHÔNG gán messengerId ở đây. Chờ frontend khách đăng nhập web xong mới link.
  } else {
    user = new User({
      messengerId: psid,
      email,
      phone,
      provider: 'pending',
      fullName: 'Khách hàng',
      role: 'customer',
      securityToken: crypto.randomBytes(16).toString('hex'),
      status: 'Pending_Password'
    });
    needToUpdateUser = true;
  }

  // Xác định xem có phải khách cũ đã có password chưa
  isReturningCustomer = (user.status === 'Active' || !!user.password);
  fullName = user.fullName || 'Khách hàng';

  // ─────────────────────────────────────────────────────────────
  // BƯỚC 2: CHUẨN BỊ DỮ LIỆU ĐỌC 
  // ─────────────────────────────────────────────────────────────
  const priceCache = session.calculatedPriceResult;
  let finalSubtotal = priceCache?.subtotal || 1500000;
  let finalTax = priceCache?.tax || 0;
  let finalTotalPrice = priceCache?.totalPrice || 1500000;
  let finalBreakdown = priceCache?.breakdown || session.calculatedBreakdown || {
    baseTransportFee: finalTotalPrice, vehicleFee: 0, laborFee: 0,
    stairsFee: 0, packingFee: 0, assemblingFee: 0
  };

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
      pricing: {
        subtotal: finalSubtotal, totalPrice: finalTotalPrice, tax: finalTax, discountAmount: 0,
        promotionCode: null, pricingDataId: pricingDataObjectId
      }
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
      images: session.surveyDataCache.images || [],
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

    // COMMIT
    await dbSession.commitTransaction();

  } catch (error) {
    // ROLLBACK
    await dbSession.abortTransaction();
    console.error('[CreateOrder] Transaction Error:', error);
    return `[HỆ_THỐNG_BÁO_LỖI]: Đã xảy ra lỗi khi tạo đơn hàng (${error.message}). Bạn hãy xin lỗi khách hàng và báo họ thử lại sau ít phút.`;
  } finally {
    dbSession.endSession();
  }
  delete session.surveyDataCache;
  delete session.calculatedPriceResult;


  // ─────────────────────────────────────────────────────────────
  // BƯỚC 4: SINH LINK VÀ TIN NHẮN TRẢ VỀ
  // ─────────────────────────────────────────────────────────────
  const FE_URL = process.env.FRONTEND_URL;
  const targetPath = `/customer/order`;
  if (isReturningCustomer) {
    let finalRedirectUrl = targetPath;
    if (isUnverifiedClaim) {
      const linkToken = jwt.sign(
        { email: user.email, linkMessengerId: psid, intent: 'link_messenger' },
        process.env.JWT_SECRET || 'SECRET',
        { expiresIn: '15m' }
      );
      finalRedirectUrl += `?link_token=${linkToken}`;
    }
    const redirectParam = encodeURIComponent(finalRedirectUrl);
    const directLink = `${FE_URL}/login?redirect=${redirectParam}`;
    let msg = `Dạ hệ thống ghi nhận email đã tồn tại trên hệ thống,anh chị vui lòng đăng nhập vào trang web ✅\n\n`;
    msg += `Để đảm bảo không phát sinh bất kỳ chi phí nào, nhân viên điều phối của HOMS sẽ liên hệ với anh/chị trên trang web để chốt chính xác danh sách đồ.\n`;
    msg += `Anh/chị có thể xem trước chi tiết lộ trình tại đây: 👉 ${directLink}`;
    return msg;
  } else {
    // Khách mới
    const setupToken = jwt.sign(
      { id: user._id, facebookId, st: user.securityToken, email, fullName, phone, type: 'setup_account' },
      process.env.JWT_SECRET || 'SECRET',
      { expiresIn: '10m' }
    );
    const magicLink = `${FE_URL}/magic?token=${setupToken}&redirect=${encodeURIComponent(targetPath)}`;
    return (
      `Dạ em đã tạo báo giá tạm tính cho anh/chị xong rồi ạ! 🎉\n\n` +
      `Vì email này chưa tồn tại trong hệ thống, anh/chị hãy click vào link dưới đây để thiết lập mật khẩu và xem chi tiết đơn hàng nhé:\n👉 ${magicLink}\n\n` +
      `Link sẽ hết hạn sau 10 phút \n` +
      `Anh/chị vui lòng chờ nhân viên bên tụi em xác nhận lại đồ đạc vì AI đôi khi sai sót không đảm bảo 100%, nên giá cả có thể sẽ thay đổi, xin anh/chị thông cảm !`
    );
  }
}
module.exports = { handleCalculatePrice, handleRequestDiscount, handleCreateOrder, generateMagicLinkForUser };