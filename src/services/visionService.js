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
Analyze the provided media (${imageCount} images).

STEP 1: CLASSIFICATION
Determine if these images are RELEVANT to moving house, furniture, appliances, or packed boxes.
If the images are Memes, Selfies, random internet pictures, documents, or clearly NOT related to moving logistics -> Set "isRelevant" to false.

STEP 2: EXTRACTION (Only if isRelevant is true)
Identify ALL visible items across ALL images. Combine duplicates!
All text fields MUST be in Vietnamese.
Return ONLY a valid JSON object.

Example of IRRELEVANT response (Meme, selfie, etc.):
{
  "isRelevant": false,
  "items": [],
  "totalActualWeight": 0,
  "totalActualVolume": 0,
  "notes": "Ảnh không liên quan đến đồ đạc chuyển nhà"
}

Example of RELEVANT response:
{
  "isRelevant": true,
  "items": [
    {
      "name": "Đàn Piano",
      "actualWeight": 200,
      "actualVolume": 1.17
    }
  ],
  "totalActualWeight": 200,
  "totalActualVolume": 1.17,
  "notes": "Tổng hợp đồ đạc từ tất cả ảnh"
}

Rules:
- Estimate realistic weight (kg) and volume (m³) for EVERY item.
- Return pure JSON only.`;

  try {
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
    const fetchPromises = imageUrls.map(url => fetchImageForGemini(url));
    const imageParts = (await Promise.all(fetchPromises)).filter(part => part !== null);

    if (imageParts.length === 0) return { isRelevant: false, items: [], totalWeight: 0, totalVolume: 0, systemMessage: "" };

    const visionJsonRaw = await analyzeImagesWithVision(imageParts, imageParts.length);
    if (!visionJsonRaw) throw new Error("Gemini không trả về kết quả.");

    const cleanedJson = visionJsonRaw.replace(/```json/g, '').replace(/```/g, '').trim();
    const visionData = JSON.parse(cleanedJson);

   
    if (visionData.isRelevant === false) {
       return { 
         isRelevant: false, 
         items: [], 
         totalWeight: 0, 
         totalVolume: 0, 
         systemMessage: "Hệ thống phát hiện ảnh không phải đồ đạc chuyển nhà." 
       };
    }

   
    const items = visionData.items || [];
    const totalWeight = visionData.totalActualWeight || 0;
    const totalVolume = visionData.totalActualVolume || 0;

    const itemNames = items.map(item => item.name).join(', ');
    const systemMessage = `Đã quét ${imageUrls.length} ảnh. Các món đồ nhận diện: [${itemNames}]. Tổng khối lượng: ~${totalWeight}kg.`;

    return { isRelevant: true, items, totalWeight, totalVolume, systemMessage };
  } catch (e) {
    console.error(`[Vision] Lỗi processIncomingImages:`, e.message);
    return { isRelevant: false, items: [], totalWeight: 0, totalVolume: 0, systemMessage: "Gặp lỗi khi phân tích ảnh." };
  }
}

module.exports = { processIncomingImages };