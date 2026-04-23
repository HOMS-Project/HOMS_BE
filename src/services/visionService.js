const axios = require('axios');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY || process.env.GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────
// FETCH & COMPRESS ẢNH TỪ URL
// ─────────────────────────────────────────────────────────────
async function fetchImageForGemini(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const compressedImageBuffer = await sharp(response.data)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return {
      inlineData: {
        data: compressedImageBuffer.toString('base64'),
        mimeType: 'image/jpeg'
      }
    };
  } catch (err) {
    console.error('[Vision] Lỗi fetch ảnh:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// GỌI GEMINI QUÉT TẤT CẢ ẢNH CÙNG MỘT LÚC (GOM BATCH)
// ─────────────────────────────────────────────────────────────
async function analyzeImagesWithVision(imageParts, imageCount) {
  const visionModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  });

  const visionPrompt = `You are an expert moving logistics coordinator in Vietnam.
Analyze the provided media (${imageCount} images) and identify ALL visible items across ALL images.
IMPORTANT: Combine duplicates! If you see the same item (like a fridge) from different angles in different images, only list it ONCE.
All text fields (name, notes) MUST be in Vietnamese.
Return ONLY a valid JSON object. Use realistic estimated numbers for each item.

Example of a valid response format:
{
  "items": [
    {
      "name": "Đàn Piano",
      "category": "primary",
      "actualWeight": 200,
      "actualDimensions": { "length": 150, "width": 60, "height": 130 },
      "actualVolume": 1.17,
      "condition": "GOOD",
      "notes": "Đàn piano đứng, cần cẩn thận"
    }
  ],
  "totalActualWeight": 200,
  "totalActualVolume": 1.17,
  "totalActualItems": 1,
  "notes": "Tổng hợp đồ đạc từ tất cả ảnh"
}

Rules:
- category: use 'primary' for large/heavy furniture; use 'secondary' for small items.
- Estimate realistic weight (kg), dimensions (cm), and volume (m³) for EVERY item — do NOT use 0.
- All numeric fields must be plain numbers.
- Do not output Bounding Boxes to avoid parsing errors.
- Do not add any extra fields, comments, or markdown. Return pure JSON only.`;

  try {
    // Truyền vào Prompt và một mảng chứa TẤT CẢ các ảnh
    const result = await visionModel.generateContent([visionPrompt, ...imageParts]);
    return result.response.text();
  } catch (err) {
    console.error('[Vision] Lỗi analyzeImage:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// XỬ LÝ TOÀN BỘ LUỒNG ẢNH: FETCH → ANALYZE → PARSE
// ─────────────────────────────────────────────────────────────
async function processIncomingImages(imageUrls) {
  try {
    // 1. Tải và nén tất cả ảnh cùng lúc (chạy song song cho nhanh)
    const fetchPromises = imageUrls.map(url => fetchImageForGemini(url));
    const imageParts = (await Promise.all(fetchPromises)).filter(part => part !== null);

    if (imageParts.length === 0) return { items: [], totalWeight: 0, totalVolume: 0, systemMessage: "" };

    // 2. Gửi TẤT CẢ ảnh cho Gemini quét trong 1 lần duy nhất
    const visionJsonRaw = await analyzeImagesWithVision(imageParts, imageParts.length);
    if (!visionJsonRaw) throw new Error("Gemini không trả về kết quả.");

    // 3. Parse JSON
    const cleanedJson = visionJsonRaw.replace(/```json/g, '').replace(/```/g, '').trim();
    const visionData = JSON.parse(cleanedJson);

    const items = visionData.items || [];
    const totalWeight = visionData.totalActualWeight || 0;
    const totalVolume = visionData.totalActualVolume || 0;

    const itemNames = items.map(item => item.name).join(', ');
    const systemMessage = `Đã quét ${imageUrls.length} ảnh. Các món đồ nhận diện: [${itemNames}]. Tổng khối lượng: ~${totalWeight}kg.`;

    return { items, totalWeight, totalVolume, systemMessage };
  } catch (e) {
    console.error(`[Vision] Lỗi processIncomingImages:`, e.message);
    return { items: [], totalWeight: 0, totalVolume: 0, systemMessage: "Gặp lỗi khi phân tích ảnh." };
  }
}

module.exports = { fetchImageForGemini, analyzeImagesWithVision, processIncomingImages };