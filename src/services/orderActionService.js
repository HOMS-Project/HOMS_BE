const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../models/User");
const GeocodeService = require("./geocodeService");
const PricingCalculationService = require("./pricingCalculationService");
const RouteValidationService = require("./routeValidationService");
const SurveyData = require("../models/SurveyData");
const PricingData = require("../models/PricingData");
const Promotion = require("../models/Promotion");
const RequestTicket = require("../models/RequestTicket");
const AutoAssignmentService = require("./AutoAssignmentService");
const SurveyService = require("./surveyService");
const GOONG_API_KEY = process.env.GOONG_API_KEY;

// ─────────────────────────────────────────────────────────────
// GOONG / OSRM HELPERS
// ─────────────────────────────────────────────────────────────

/** Chuyển địa chỉ text thành tọa độ { lat, lng } */
async function getCoordinates(address) {
  try {
    const searchAddress = address.toLowerCase().includes("đà nẵng")
      ? address
      : `${address}, Đà Nẵng, Việt Nam`;

    const res = await axios.get("https://rsapi.goong.io/geocode", {
      params: { address: searchAddress, api_key: GOONG_API_KEY },
      timeout: 5000,
    });
    if (res.data.results && res.data.results.length > 0) {
      return res.data.results[0].geometry.location; // { lat, lng }
    }
    return null;
  } catch (err) {
    console.error("[Goong] Forward Geocode lỗi:", err.message);
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
    console.warn("[Route] Goong failed:", e.message);
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
    console.warn("[Route] OSRM failed:", e.message);
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
  const moveType = aiAction.movingType || "FULL_HOUSE";

  if (!data.from || !data.to || data.from === "địa chỉ đi") {
    return "[HỆ_THỐNG_BÁO_LỖI]: Bạn chưa lấy đủ địa chỉ ĐI và ĐẾN chi tiết. Hãy khéo léo xin lỗi và hỏi lại khách hàng ngay lập tức!";
  }
  if (!data.movingTime) {
    return "[HỆ_THỐNG_BÁO_LỖI]: Thiếu thông tin thời gian chuyển. Hãy hỏi khách hàng muốn chuyển vào ngày giờ nào để kiểm tra kẹt xe/cấm tải.";
  }

  const pickupTime = new Date(data.movingTime);
  const now = new Date();

  // 1. Kiểm tra nếu AI không chuyển đổi được thời gian (trả về chữ hoặc sai format)
  if (isNaN(pickupTime.getTime())) {
    return "[HỆ_THỐNG_BÁO_LỖI]: AI chưa chuyển được thời gian sang dạng ngày tháng cụ thể. Bạn BẮT BUỘC phải yêu cầu khách cung cấp lại ngày dương lịch chính xác (ví dụ: ngày 28/04/2026).";
  }

  // 2. Kiểm tra nếu chọn giờ quá khứ (Cho phép du di 1 tiếng - 3600000ms)
  if (pickupTime < new Date(now.getTime() - 3600000)) {
    return "[HỆ_THỐNG_BÁO_LỖI]: Thời gian chuyển không hợp lệ vì nằm trong quá khứ. Hãy nhờ khách cho ngày cụ thể ở TƯƠNG LAI (Ví dụ: 25/04/2026).";
  }

  console.log("🔄 Đang tính giá bằng API thật...", data);

  // 1. Lấy tọa độ
  const fromCoords = await getCoordinates(data.from);
  const toCoords = await getCoordinates(data.to);
  if (!fromCoords || !toCoords) {
    return "[HỆ_THỐNG_BÁO_LỖI]: Không tìm thấy địa chỉ này trên bản đồ Đà Nẵng. Nhờ khách kiểm tra lại tên đường/quận.";
  }

  // 2. Khoảng cách & quận
  const distanceKm = await getRouteDistance(fromCoords, toCoords);
  const pickupDistrict = await GeocodeService.reverseGeocode(
    fromCoords.lat,
    fromCoords.lng,
  );
  const deliveryDistrict = await GeocodeService.reverseGeocode(
    toCoords.lat,
    toCoords.lng,
  );

  let suggestedVehicle = "1TON";
  let suggestedStaffCount = 1;
  let finalActualWeight = 0;
  let finalActualVolume = 0;
  let routeWarnings = [];
  let finalEstimatedHours = undefined;
  const ITEM_DICTIONARY = {
    "giường 1m": {
      weight: 25,
      volume: 0.35,
      category: "bulky",
      aliases: ["giường 1m", "giường đơn nhỏ"],
    },
    "giường 1m2": {
      weight: 30,
      volume: 0.45,
      category: "bulky",
      aliases: ["giường 1m2", "giường 1.2m"],
    },
    "giường 1m6": {
      weight: 40,
      volume: 0.6,
      category: "bulky",
      aliases: ["giường 1m6", "giường 1.6m"],
    },
    "giường 1m8": {
      weight: 50,
      volume: 0.7,
      category: "bulky",
      aliases: ["giường 1m8", "giường 1.8m"],
    },
    "giường 2m": {
      weight: 60,
      volume: 0.8,
      category: "bulky",
      aliases: ["giường 2m"],
    },

    giường: {
      weight: 45,
      volume: 0.6,
      category: "bulky",
      aliases: ["giường ngủ", "nệm", "giường đôi", "giường đơn"],
    },

    // --- TỦ QUẦN ÁO ---
    "tủ 2 cánh": {
      weight: 60,
      volume: 0.9,
      category: "bulky",
      aliases: ["tủ 2 cánh", "tủ nhỏ"],
    },
    "tủ 3 cánh": {
      weight: 90,
      volume: 1.3,
      category: "bulky",
      aliases: ["tủ 3 cánh"],
    },
    "tủ 4 cánh": {
      weight: 120,
      volume: 1.8,
      category: "bulky",
      aliases: ["tủ 4 cánh", "tủ lớn"],
    },

    "tủ quần áo": {
      weight: 90,
      volume: 1.3,
      category: "bulky",
      aliases: ["tủ áo", "tủ đồ", "tủ gỗ"],
    },

    // --- SOFA ---
    "sofa 1 chỗ": {
      weight: 25,
      volume: 0.4,
      category: "bulky",
      aliases: ["sofa đơn"],
    },
    "sofa 2 chỗ": {
      weight: 50,
      volume: 0.8,
      category: "bulky",
      aliases: ["sofa 2 chỗ"],
    },
    "sofa góc l": {
      weight: 90,
      volume: 1.5,
      category: "bulky",
      aliases: ["sofa góc l", "sofa chữ l"],
    },
    "sofa bộ": {
      weight: 110,
      volume: 2.0,
      category: "bulky",
      aliases: ["bộ sofa", "sofa 3+1+1"],
    },

    sofa: {
      weight: 80,
      volume: 1.2,
      category: "bulky",
      aliases: ["ghế sofa", "sofa"],
    },

    // --- TỦ LẠNH ---
    "tủ lạnh nhỏ": {
      weight: 40,
      volume: 0.3,
      category: "heavy",
      aliases: ["tủ lạnh 100l", "tủ lạnh 150l"],
    },
    "tủ lạnh trung": {
      weight: 55,
      volume: 0.45,
      category: "heavy",
      aliases: ["tủ lạnh 200l", "tủ lạnh 250l"],
    },
    "tủ lạnh lớn": {
      weight: 70,
      volume: 0.65,
      category: "heavy",
      aliases: ["tủ lạnh 300l", "tủ lạnh 400l"],
    },
    "tủ lạnh side by side": {
      weight: 100,
      volume: 1.0,
      category: "heavy",
      aliases: ["side by side"],
    },

    "tủ lạnh": {
      weight: 65,
      volume: 0.6,
      category: "heavy",
      aliases: ["tủ đá"],
    },

    // --- MÁY GIẶT ---
    "máy giặt cửa trước": {
      weight: 60,
      volume: 0.25,
      category: "heavy",
      aliases: ["cửa trước"],
    },
    "máy giặt cửa trên": {
      weight: 35,
      volume: 0.18,
      category: "heavy",
      aliases: ["cửa trên"],
    },

    "máy giặt": {
      weight: 50,
      volume: 0.25,
      category: "heavy",
      aliases: ["máy giặt"],
    },

    // --- TIVI ---
    "tivi 32 inch": {
      weight: 6,
      volume: 0.12,
      category: "default",
      aliases: ["32 inch"],
    },
    "tivi 43 inch": {
      weight: 9,
      volume: 0.18,
      category: "default",
      aliases: ["43 inch"],
    },
    "tivi 55 inch": {
      weight: 14,
      volume: 0.28,
      category: "default",
      aliases: ["55 inch"],
    },
    "tivi 65 inch": {
      weight: 20,
      volume: 0.38,
      category: "default",
      aliases: ["65 inch"],
    },

    tivi: {
      weight: 15,
      volume: 0.25,
      category: "default",
      aliases: ["tv", "màn hình"],
    },
    "bàn ăn nhỏ": {
      weight: 30,
      volume: 0.6,
      category: "bulky",
      aliases: ["bàn ăn nhỏ", "bàn 4 ghế", "bàn ăn 4 ghế"],
    },

    "bàn ăn lớn": {
      weight: 55,
      volume: 1.1,
      category: "bulky",
      aliases: [
        "bàn ăn lớn",
        "bàn 6 ghế",
        "bàn 8 ghế",
        "bàn ăn 6 ghế",
        "bàn ăn 8 ghế",
      ],
    },

    // fallback
    bàn: {
      weight: 40,
      volume: 0.8,
      category: "bulky",
      aliases: ["bàn làm việc", "bàn học", "bàn gỗ", "bàn"],
    },
    "kệ sách nhỏ": {
      weight: 15,
      volume: 0.3,
      category: "bulky",
      aliases: ["kệ nhỏ", "kệ sách nhỏ", "kệ mini"],
    },

    "kệ sách trung": {
      weight: 30,
      volume: 0.6,
      category: "bulky",
      aliases: ["kệ trung", "kệ sách trung", "kệ vừa"],
    },

    "kệ sách lớn": {
      weight: 50,
      volume: 1.0,
      category: "bulky",
      aliases: ["kệ lớn", "kệ sách lớn", "kệ to"],
    },

    // fallback
    kệ: {
      weight: 30,
      volume: 0.6,
      category: "bulky",
      aliases: ["kệ sách", "tủ hồ sơ", "kệ trưng bày", "tủ kệ", "kệ"],
    },
    "máy tính": {
      weight: 20,
      volume: 0.3,
      category: "default",
      aliases: ["pc", "máy tính để bàn", "cpu", "màn hình máy tính"],
    },
    "điều hòa 1 HP": {
      weight: 30,
      volume: 0.25,
      category: "default",
      aliases: ["điều hòa 1hp", "máy lạnh 1hp"],
    },

    "điều hòa 1.5 HP": {
      weight: 38,
      volume: 0.35,
      category: "default",
      aliases: ["điều hòa 1.5hp", "máy lạnh 1.5hp"],
    },

    "điều hòa 2 HP": {
      weight: 50,
      volume: 0.45,
      category: "default",
      aliases: ["điều hòa 2hp", "máy lạnh 2hp"],
    },

    // fallback
    "điều hòa": {
      weight: 35,
      volume: 0.3,
      category: "default",
      aliases: ["máy lạnh", "cục nóng", "cục lạnh", "điều hòa"],
    },
    "xe máy": {
      weight: 100,
      volume: 1.0,
      category: "heavy",
      aliases: ["xe tay ga", "xe số", "motor"],
    },

    // --- Nhóm đồ nhỏ (Secondary) ---
    "thùng carton": {
      weight: 15,
      volume: 0.1,
      category: "default",
      aliases: ["thùng giấy", "hộp", "thùng đồ", "vali", "túi", "thùng"],
    },
    "quần áo": {
      weight: 5,
      volume: 0.2,
      category: "default",
      aliases: ["giày dép", "đồ cá nhân", "túi quần áo"],
    },
    "đồ bếp": {
      weight: 10,
      volume: 0.2,
      category: "default",
      aliases: [
        "bát đĩa",
        "xoong nồi",
        "chén bát",
        "lò vi sóng",
        "dụng cụ bếp",
        "bếp gas",
      ],
    },
    "cây cảnh": {
      weight: 20,
      volume: 0.5,
      category: "default",
      aliases: ["chậu hoa", "cây kiểng", "chậu cây"],
    },
    "đồ điện": {
      weight: 5,
      volume: 0.1,
      category: "default",
      aliases: ["quạt", "đèn", "thiết bị điện", "quạt đứng", "quạt trần"],
    },
    tranh: {
      weight: 5,
      volume: 0.1,
      category: "default",
      aliases: ["ảnh", "gương", "tranh treo tường"],
    },

    // --- Nhóm đồ giá trị cao/đặc biệt (Critical) ---
    "két sắt": {
      weight: 80,
      volume: 0.2,
      category: "heavy",
      aliases: ["két tiền", "tủ an toàn", "két"],
    },
    "tài liệu": {
      weight: 5,
      volume: 0.05,
      category: "default",
      aliases: ["giấy tờ", "hồ sơ", "bằng cấp"],
    },
    rượu: {
      weight: 10,
      volume: 0.1,
      category: "default",
      aliases: ["đồ uống cao cấp", "chai rượu"],
    },
    "nhạc cụ": {
      weight: 30,
      volume: 0.5,
      category: "heavy",
      aliases: ["đàn", "guitar", "piano", "organ"],
    },
  };
  let rawItems = [...(session.visionItems || []), ...(data.items || [])];

  let finalItems = rawItems.map((item) => {
    let itemName = (item.name || "").toLowerCase();
    let quantity = Number(item.quantity) || 1;
    let finalName = item.name || "Đồ đạc";

    // 1. Tìm match trong Dictionary
    let matchedRule = Object.keys(ITEM_DICTIONARY).find((key) => {
      const meta = ITEM_DICTIONARY[key];
      return (
        itemName.includes(key) ||
        meta.aliases.some((alias) => itemName.includes(alias))
      );
    });

    let baseWeight = 20;
    let baseVolume = 0.2;
    let baseCategory = "default";
    if (matchedRule) {
      baseWeight = ITEM_DICTIONARY[matchedRule].weight;
      baseVolume = ITEM_DICTIONARY[matchedRule].volume;
      baseCategory = ITEM_DICTIONARY[matchedRule].category;
    } else {
      if (!finalName.includes("[Khác]")) {
        finalName = `[Khác] ${finalName}`;
      }
    }

    // 2. Logic xử lý tính từ (to/nhỏ) & kích thước đặc biệt
    let modifier = 1.0;

    // Đồ nhỏ
    if (/(nhỏ|mini|ít|bé)/.test(itemName)) {
      modifier = 0.6;
    }
    // Đồ to/lớn
    else if (
      /(to|lớn|bự|side by side|4 cánh|1m8|1\.8m|(?<![\d\.])2m|king)/.test(
        itemName,
      )
    ) {
      modifier = 1.4;
    } else if (/(3 cánh|1m6|1.6m)/.test(itemName)) {
      modifier = 1.15;
    }

    return {
      name: finalName,
      quantity: quantity,
      actualWeight:
        (Number(item.actualWeight) || baseWeight * modifier) * quantity,
      actualVolume:
        (Number(item.actualVolume) || baseVolume * modifier) * quantity,
      category: baseCategory,
      source: "AI",
    };
  });

  let totalCalculatedWeight = finalItems.reduce(
    (sum, item) => sum + item.actualWeight,
    0,
  );
  let totalCalculatedVolume = finalItems.reduce(
    (sum, item) => sum + item.actualVolume,
    0,
  );

  if (moveType === "FULL_HOUSE") {
    if (totalCalculatedWeight < 300) totalCalculatedWeight = 300;
    if (totalCalculatedVolume < 3) totalCalculatedVolume = 3;
  }

  const floors = Number(data.floors) || 0;

  if (moveType === "TRUCK_RENTAL") {
    suggestedVehicle = data.suggestedVehicle || "1TON";
    suggestedStaffCount = Number(data.suggestedStaffCount) || 1;
    finalEstimatedHours = Number(data.rentalDurationHours) || 1;
  } else {
    const estimation = await SurveyService.estimateResources({
      items: finalItems,
      distanceKm: distanceKm,
      floors: floors,
      hasElevator: data.hasElevator || false,
      carryMeter: Number(data.carryMeter) || 0,
      needsAssembling: data.needsAssembling || false,
      needsPacking: data.needsPacking || false,
    });

    suggestedVehicle = estimation.suggestedVehicle;
    suggestedStaffCount = estimation.suggestedStaffCount;
    finalActualWeight =
      Number(data.totalWeight) > 0
        ? Number(data.totalWeight)
        : estimation.totalWeight;
    finalActualVolume = estimation.totalVolume;
    routeWarnings = estimation.routeWarnings || [];
    if (estimation.estimatedMinutes) {
      finalEstimatedHours =
        Math.round((estimation.estimatedMinutes / 60) * 10) / 10;
    }
  }

  // 4. Validate lộ trình (Cấm tải, khung giờ)
  const routeValidation = await RouteValidationService.validateRoute(null, {
    vehicleType: suggestedVehicle,
    totalWeight: finalActualWeight,
    totalVolume: finalActualVolume,
    pickupTime,
    pickupAddress: data.from,
    deliveryAddress: data.to,
  });

  const existingImages = session.surveyDataCache?.images || [];

  const surveyData = {
    movingType: moveType,
    images: existingImages,
    pickup: {
      address: data.from,
      coordinates: fromCoords,
      district: pickupDistrict,
    },
    delivery: {
      address: data.to,
      coordinates: toCoords,
      district: deliveryDistrict,
    },
    distanceKm,
    carryMeter: Number(data.carryMeter) || 0,
    floors,
    hasElevator: data.hasElevator || false,
    needsAssembling: data.needsAssembling || false,
    needsPacking: data.needsPacking || false,
    items: finalItems,
    scheduledTime: pickupTime,

    suggestedVehicle: suggestedVehicle, 
    suggestedStaffCount: suggestedStaffCount,
    rentalDurationHours: Number(data.rentalDurationHours) || 1,
    estimatedHours: finalEstimatedHours,
    totalActualWeight: finalActualWeight,
    totalActualVolume: finalActualVolume,
    insuranceRequired: false,
    declaredValue: 0,
  };

  session.surveyDataCache = surveyData;

  let finalPrice = 0;
  try {
    const priceList = await PricingCalculationService.getActivePriceList();
    if (!priceList) throw new Error("Không có bảng giá active");

    const priceResult = await PricingCalculationService.calculatePricing(
      surveyData,
      priceList,
      moveType,
    );

    finalPrice = priceResult.totalPrice;
    session.calculatedPriceResult = priceResult;
    session.calculatedBreakdown = priceResult.breakdown;
  } catch (pricingErr) {
    console.error("[Pricing Error]", pricingErr.message);
    session.calculatedBreakdown = null;
    return `[HỆ_THỐNG_BÁO_LỖI]: Lỗi hệ thống tính giá (${pricingErr.message}). Xin lỗi khách và báo kỹ thuật.`;
  }

  // 7. Cảnh báo lộ trình
  let routeAlertMsg = "";
  if (routeWarnings && routeWarnings.length > 0) {
    routeAlertMsg += `\n[LƯU Ý XE]: ${routeWarnings.join(" ")}`;
  }
  if (routeValidation && routeValidation.violations?.length > 0) {
    routeAlertMsg += `\n[VI PHẠM QUY ĐỊNH]: ${routeValidation.violations.join(" | ")}. Báo khách hàng khung giờ này cấm tải hoặc xe không vào được, đề nghị đổi giờ.`;
  }

  const lowPrice = finalPrice - 500000;
  const highPrice = finalPrice + 500000;

  if (moveType === "TRUCK_RENTAL") {
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

async function checkAvailablePromotions() {
  const now = new Date();
  return await Promotion.find({
    status: "Active",
    validFrom: { $lte: now },
    validUntil: { $gte: now },
  }).limit(3);
}

async function handleRequestDiscount(aiAction) {
  const activePromos = await checkAvailablePromotions();

  if (activePromos && activePromos.length > 0) {
    const promoList = activePromos.map((p) => `"${p.code}"`).join(", ");

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

  const targetPath = orderId ? `/customer/order` : "/customer";

  const setupToken = jwt.sign(
    {
      id: user._id,
      facebookId: user.facebookId,
      st: user.securityToken,
      email: user.email,
      phone: user.phone,
      type: "setup_account",
    },
    process.env.JWT_SECRET || "SECRET",
    { expiresIn: "10m" },
  );

  return `${process.env.FRONTEND_URL}/magic?token=${setupToken}&redirect=${encodeURIComponent(targetPath)}`;
}

// ─────────────────────────────────────────────────────────────
// ACTION: CHỐT ĐƠN
// ─────────────────────────────────────────────────────────────

async function handleCreateOrder(aiAction, session, facebookId) {
  const phone = aiAction.phone || (aiAction.data && aiAction.data.phone);
  const phoneRegex = /^[0-9]{10,11}$/;

  if (!phone || !phoneRegex.test(phone)) {
    return "[HỆ_THỐNG_BÁO_LỖI]: Bạn chưa có số điện thoại hợp lệ của khách. Hãy yêu cầu khách cung cấp số điện thoại (10-11 chữ số) để tiện liên lạc ạ.";
  }

  const extractedEmail =
    aiAction.email || (aiAction.data && aiAction.data.email) || "";
  const rawEmailText = extractedEmail.toLowerCase();

  const emailMatch = rawEmailText.match(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/,
  );
  const email = emailMatch ? emailMatch[0] : null;
  console.log(
    "Email nhận được từ AI:",
    extractedEmail,
    "-> Email sau khi RegEx:",
    email,
  );

  if (!email) {
    return "[HỆ_THỐNG_BÁO_LỖI]: Email không hợp lệ hoặc chưa được cung cấp. Hãy xin lại email chính xác từ khách hàng!";
  }

  if (!session.surveyDataCache) {
    throw new Error(
      "Không có dữ liệu tính giá — Vui lòng báo khách hàng tính giá trước khi chốt đơn.",
    );
  }

  const psid = facebookId;
  const userByFb = await User.findOne({ messengerId: psid });
  const userByEmail = await User.findOne({ email });

  let isReturningCustomer = false;
  let fullName = "Khách hàng Facebook";
  let user = null;
  let isUnverifiedClaim = false;
  let needToUpdateUser = false;

  if (userByFb && userByEmail) {
    if (userByFb._id.toString() !== userByEmail._id.toString()) {
      return `[HỆ_THỐNG_BÁO]: Email ${email} đã được đăng ký bởi một tài khoản khác. Anh/chị vui lòng kiểm tra lại hoặc sử dụng email khác.`;
    }
    user = userByFb;
    if (!user.phone && phone) {
      user.phone = phone;
      needToUpdateUser = true;
    }
  } else if (userByFb) {
    user = userByFb;
    user.email = email;
    if (!user.phone && phone) {
      user.phone = phone;
    }
    needToUpdateUser = true;
  } else if (userByEmail) {
    user = userByEmail;
    isUnverifiedClaim = true;
  } else {
    user = new User({
      messengerId: psid,
      email,
      phone,
      provider: "pending",
      fullName: "Khách hàng",
      role: "customer",
      securityToken: crypto.randomBytes(16).toString("hex"),
      status: "Pending_Password",
    });
    needToUpdateUser = true;
  }

  isReturningCustomer = user.status === "Active" || !!user.password;
  fullName = user.fullName || "Khách hàng";

  // ─────────────────────────────────────────────────────────────
  // BƯỚC 2: CHUẨN BỊ DỮ LIỆU ĐỌC
  // ─────────────────────────────────────────────────────────────
  const priceCache = session.calculatedPriceResult;
  let finalSubtotal = priceCache?.subtotal || 1500000;
  let finalTax = priceCache?.tax || 0;
  let finalTotalPrice = priceCache?.totalPrice || 1500000;
  let finalBreakdown = priceCache?.breakdown ||
    session.calculatedBreakdown || {
      baseTransportFee: finalTotalPrice,
      vehicleFee: 0,
      laborFee: 0,
      stairsFee: 0,
      packingFee: 0,
      assemblingFee: 0,
    };

  const actualMoveType = session.surveyDataCache.movingType;
  const pricingDataObjectId = new mongoose.Types.ObjectId();
  const randomString = crypto.randomBytes(2).toString("hex").toUpperCase();
  const code = `REQ-${new Date().getFullYear()}-${randomString}`;

  const ticketStatus = "WAITING_REVIEW";
  const ticketNotes = `[TẠO TỪ AI BOT - GỬI QUOTED CHO KHÁCH] ${aiAction.notes || ""}`;

  let activePriceList =
    await PricingCalculationService.getActivePriceList().catch(() => null);

  // ─────────────────────────────────────────────────────────────
  // BƯỚC 3: DATABASE TRANSACTION (Chỉ chứa các lệnh GHI - WRITE)
  // ─────────────────────────────────────────────────────────────
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  let newTicket;

  try {
    if (needToUpdateUser) {
      await user.save({ session: dbSession });
    }

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
        subtotal: finalSubtotal,
        totalPrice: finalTotalPrice,
        tax: finalTax,
        discountAmount: 0,
        promotionCode: null,
        pricingDataId: pricingDataObjectId,
      },
    });

    const assignedDispatcherId =
      await AutoAssignmentService.assignDispatcher(newTicket);
    if (assignedDispatcherId) {
      newTicket.dispatcherId = assignedDispatcherId;
      newTicket.status = "WAITING_REVIEW";
    } else {
      newTicket.status = "PENDING_ASSIGNMENT";
    }
    await newTicket.save({ session: dbSession });

    const newSurvey = new SurveyData({
      requestTicketId: newTicket._id,
      surveyType: "ONLINE",
      status: "COMPLETED",
      images: session.surveyDataCache.images || [],
      ...session.surveyDataCache,
    });
    await newSurvey.save({ session: dbSession });

    const newPricing = new PricingData({
      _id: pricingDataObjectId,
      requestTicketId: newTicket._id,
      surveyDataId: newSurvey._id,
      priceListId: activePriceList
        ? activePriceList._id
        : new mongoose.Types.ObjectId(),
      totalPrice: finalTotalPrice,
      subtotal: finalSubtotal,
      tax: finalTax,
      breakdown: finalBreakdown,
      dynamicAdjustment: priceCache?.dynamicAdjustment || null,
    });
    await newPricing.save({ session: dbSession });

    await dbSession.commitTransaction();

    // Notify Head Dispatchers
    try {
      const User = require('../models/User');
      const headDispatchers = await User.find({
        role: 'dispatcher',
        'dispatcherProfile.isGeneral': true
      }).select('_id');
      const { getIo } = require('../utils/socket');
      const io = getIo();
      const T = require('../utils/notificationTemplates');
      const NotificationService = require('./notificationService');

      for (const hd of headDispatchers) {
        await NotificationService.createNotification({
          userId: hd._id,
          ...T.NEW_TICKET_CREATED({ ticketCode: newTicket.code }),
          ticketId: newTicket._id
        }, io);
      }

      // Also notify assigned dispatcher if any
      if (newTicket.dispatcherId) {
        await NotificationService.createNotification({
          userId: newTicket.dispatcherId,
          ...T.TICKET_ASSIGNED_TO_DISPATCHER({ ticketCode: newTicket.code }),
          ticketId: newTicket._id
        }, io);
      }
    } catch (err) {
      console.error('[CreateOrder] Notification failed:', err.message);
    }

  } catch (error) {
    await dbSession.abortTransaction();
    console.error("[CreateOrder] Transaction Error:", error);
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
        { email: user.email, linkMessengerId: psid, intent: "link_messenger" },
        process.env.JWT_SECRET || "SECRET",
        { expiresIn: "15m" },
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
    const setupToken = jwt.sign(
      {
        id: user._id,
        facebookId,
        st: user.securityToken,
        email,
        fullName,
        phone,
        type: "setup_account",
      },
      process.env.JWT_SECRET || "SECRET",
      { expiresIn: "10m" },
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

module.exports = {
  handleCalculatePrice,
  handleRequestDiscount,
  handleCreateOrder,
  generateMagicLinkForUser,
};
