const axios = require('axios');
const sharp = require('sharp');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);

// ─────────────────────────────────────────────────────────────
// FETCH & COMPRESS ẢNH TỪ URL ĐỂ GỬI CHO GEMINI
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
// PHÂN TÍCH ẢNH ĐỒ ĐẠC BẰNG GEMINI VISION
// ─────────────────────────────────────────────────────────────
async function analyzeImageWithVision(imagePart) {
  const visionModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  });

  const visionPrompt = `You are an expert moving logistics coordinator in Vietnam.
Analyze the provided media and identify ALL visible items.
IMPORTANT: All text fields (name, notes) MUST be in Vietnamese.
There is 1 media file provided. Set "imageIndices": [0] for all items. Also provide ONE bounding box for this item in the "boundingBoxes" field.
Return ONLY a valid JSON object. Use realistic estimated numbers for each item based on what you see.
Example of a valid response format (replace with actual values you estimate):
{
  "items": [
    {
      "name": "Đàn Piano",
      "category": "primary",
      "actualWeight": 200,
      "actualDimensions": { "length": 150, "width": 60, "height": 130 },
      "actualVolume": 1.17,
      "condition": "GOOD",
      "notes": "Đàn piano đứng, cần cẩn thận",
      "imageIndices": [0],
      "boundingBoxes": [
        {
          "imageIndex": 0,
          "centerX": 0.5,
          "centerY": 0.5,
          "width": 0.8,
          "height": 0.8
        }
      ]
    }
  ],
  "totalActualWeight": 200,
  "totalActualVolume": 1.17,
  "totalActualItems": 1,
  "notes": "Chỉ có 1 đàn piano"
}
Rules:
- category: use 'primary' for large/heavy furniture; use 'secondary' for small items.
- Estimate realistic weight (kg), dimensions (cm), and volume (m³) for EVERY item — do NOT use 0.
- All numeric fields must be plain numbers (not strings).
- imageIndices must be an array of integer media indices (0-based).
- boundingBoxes must be an array of objects. Each object MUST have: "imageIndex" (integer matching one entry from imageIndices), and four numbers "centerX", "centerY", "width", "height" — all normalized between 0 and 1 relative to that media frame.
- Do not add any extra fields, comments, or markdown.`;

  try {
    const result = await visionModel.generateContent([visionPrompt, imagePart]);
    return result.response.text();
  } catch (err) {
    console.error('[Vision] Lỗi analyzeImage:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// XỬ LÝ TOÀN BỘ LUỒNG ẢNH: FETCH → ANALYZE → PARSE
// Trả về { items, totalWeight, totalVolume, finalMessage } hoặc null nếu lỗi
// ─────────────────────────────────────────────────────────────
async function processIncomingImage(imageUrl) {
  const imagePart = await fetchImageForGemini(imageUrl);
  if (!imagePart) return null;

  const visionJsonRaw = await analyzeImageWithVision(imagePart);
  if (!visionJsonRaw) return null;

  try {
    const visionData = JSON.parse(visionJsonRaw.replace(/```json|```/g, '').trim());
    const items = visionData.items || [];
    const totalWeight = visionData.totalActualWeight || 0;
    const totalVolume = visionData.totalActualVolume || 0;
    const itemNames = items.map(item => item.name).join(', ');

    const systemMessage =
      `[THÔNG_BÁO_HỆ_THỐNG]: Khách vừa gửi ảnh đồ đạc. ` +
      `AI Vision đã quét được các món đồ sau thực tế trong ảnh: [${itemNames}]. ` +
      `Tổng khối lượng: ~${totalWeight}kg. ` +
      `\n\nHÃY LÀM THEO LỆNH: ` +
      `\n1. Khen khách gửi ảnh rõ. ` +
      `\n2. Liệt kê lại đúng các món đồ trên ([${itemNames}]) cho khách an tâm VÀ hỏi khách xem còn đồ đạc nào bị khuất camera hay nằm trong góc không?. TUYỆT ĐỐI KHÔNG TỰ BỊA RA CÁC MÓN ĐỒ NHƯ TỦ LẠNH, MÁY GIẶT NẾU KHÔNG CÓ TRONG DANH SÁCH.` +
      `\n3. Chuyển sang BƯỚC 3: Bắt đầu hỏi về địa chỉ ĐI và ĐẾN chi tiết.`;

    return { items, totalWeight, totalVolume, systemMessage };
  } catch (e) {
    console.error('[Vision] Lỗi parse JSON:', e.message);
    return null;
  }
}

module.exports = { fetchImageForGemini, analyzeImageWithVision, processIncomingImage };