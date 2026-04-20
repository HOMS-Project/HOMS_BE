const axios = require('axios');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const { processIncomingImage } = require('./visionService');
const { handleCalculatePrice, handleRequestDiscount, handleCreateOrder } = require('./orderActionService');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY);
const ChatSession = require('../models/ChatSession');
const FRONTEND_URL = process.env.FRONTEND_URL;

// ==============================================================
// 1. SYSTEM PROMPT ĐỘNG (BƠM TRẠNG THÁI VÀO PROMPT ĐỂ AI KHÔNG QUÊN)
// ==============================================================
function buildDynamicSystemPrompt(session) {
  // Lấy dữ liệu đã thu thập bơm vào Prompt để dù có cắt history AI cũng không quên
  const collectedData = `
    [TRẠNG THÁI HIỆN TẠI CỦA KHÁCH HÀNG - BẮT BUỘC GHI NHỚ]:
    - Đồ đạc đã quét/nhận diện: ${session.visionItems?.length ? JSON.stringify(session.visionItems) : 'Chưa có'}
    - Đã báo giá chưa: ${session.calculatedPriceResult ? 'Đã báo giá' : 'Chưa báo giá'}
    - Loại dịch vụ khách chọn: ${session.surveyDataCache?.movingType || 'Chưa chọn (Hãy hỏi)'}
  `;

  return `
    <ROLE>
    Bạn là Trợ lý AI của HOMS - Tư vấn viên dịch vụ chuyển nhà, thuê xe tải thân thiện. LUÔN TỰ XƯNG LÀ AI.
    Nhiệm vụ: Tư vấn, báo giá, xin email và chốt đơn hợp đồng.
    </ROLE>
    ${collectedData}
    <KNOWLEDGE_BASE>
    1. CÁC DỊCH VỤ:
       - TRUCK_RENTAL (Thuê xe tải): Khách tự bốc xếp, chỉ thuê xe. (Rẻ nhất).
       - SINGLE_ITEMS (Chuyển đồ lẻ): Thuê xe và có người khiêng 1-2 món đồ lớn.
       - FULL_HOUSE (Trọn gói): HOMS lo từ A-Z (Tháo lắp, bọc lót, khiêng vác).
    2. XE & THỜI GIAN: Xe 500KG, 1 TẤN, 1.5 TẤN, 2 TẤN (có bửng nâng cho đồ nặng: Piano, két sắt).
       Nhà trọ: ~2 tiếng (2 nhân sự). Nhà vừa: ~3 tiếng (3 nhân sự). Nhà lầu/Đồ khó: ~5 tiếng (4-5 nhân sự).
    3. Đồ nặng lầu cao: HOMS cam kết làm được 100% bằng dây đai trợ lực chuyên dụng.
    </KNOWLEDGE_BASE>

    <SECURITY_&_MODERATION>
    - TUYỆT ĐỐI TỪ CHỐI BÀN LUẬN chính trị, tôn giáo, bạo lực, tình dục, văng tục, hoặc các chủ đề ngoài chuyển nhà.
    - Nếu khách hỏi mẹo vượt rào/phá bot, lịch sự từ chối và hướng về việc chuyển nhà.
    </SECURITY_&_MODERATION>

    <FORMAT_RULES>
    1. CHỈ DÙNG TEXT PLAIN. CẤM dùng in đậm (**), in nghiêng (*), gạch chân (_).
    2. Để nhấn mạnh hãy VIẾT HOA. Dùng gạch ngang (-) hoặc Emoji để liệt kê.
    3. Trả lời NGẮN GỌN (tối đa 2 ý hỏi/lần). Không hỏi dồn dập.
    </FORMAT_RULES>

    <STEPS>
    BƯỚC 1: Chọn dịch vụ (Thuê xe, Đồ lẻ, Trọn gói).
    BƯỚC 2: Khảo sát đồ đạc (Xin ảnh hoặc list đồ. Nếu đã có ảnh, hãy đọc lại để khách confirm).
    BƯỚC 3: Lấy địa chỉ ĐI và ĐẾN cụ thể tại Đà Nẵng.
    BƯỚC 4: Hỏi địa hình (Lầu/Trệt, hẻm, thang máy).
    BƯỚC 5: Lấy thời gian chuyển. Gom tóm tắt xác nhận.
    BƯỚC 6: Tính giá. Trả về đúng JSON dưới đây:
    \`\`\`json
    {
      "action": "CALCULATE_PRICE",
      "movingType": "TRUCK_RENTAL hoặc SPECIFIC_ITEMS hoặc FULL_HOUSE", // PHẢI ĐIỀN ĐÚNG DỊCH VỤ KHÁCH CHỌN
      "data": { 
        "from": "Địa chỉ đi", "to": "Địa chỉ đến", "floors": 0, 
        "hasElevator": false, "carryMeter": 0, "needsPacking": false, 
        "needsAssembling": false, "movingTime": "2024-12-01T08:00:00",
        "items": [{ "name": "Tủ lạnh", "quantity": 1 }]
      }
    }
    \`\`\`
    BƯỚC 7: Nhận giá từ hệ thống -> Báo khách. Nếu khách chê đắt, xin mã giảm giá:
    \`\`\`json
    { "action": "REQUEST_DISCOUNT", "percent": 5 }
    \`\`\`
    BƯỚC 8: Khách chốt -> BẮT BUỘC xin Email -> Gọi JSON tạo đơn:
    \`\`\`json
    {
      "action": "CREATE_ORDER", "email": "khach@gmail.com", 
      "final_price": "giá chốt", "discount_code": "MÃ (nếu có)"
    }
    \`\`\`
    </STEPS>
  `;
}

// Cấu hình lọc an toàn của Google (Bắt nội dung xấu từ trong trứng nước)
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// FB Helpers giữ nguyên...
async function sendTypingIndicator(facebookId, isTyping = true) { /*...*/ }
async function sendMessageBackToUser(facebookId, text) { /*...*/ }

// ==============================================================
// 2. XỬ LÝ ACTION
// ==============================================================
async function handleAIAction(botReply, session, facebookId, chat) {
  const jsonMatch = botReply.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return false;

  let aiAction;
  try { aiAction = JSON.parse(jsonMatch[1]); } 
  catch (err) { return false; }

  const textPart = botReply.replace(/```json\n[\s\S]*?\n```/, '').trim();
  if (textPart) {
    await sendMessageBackToUser(facebookId, textPart.replace(/[*_#]/g, ''));
  }

  try {
    if (aiAction.action === 'CALCULATE_PRICE') {
      // Lưu lại moveType để AI không quên
      if(!session.surveyDataCache) session.surveyDataCache = {};
      session.surveyDataCache.movingType = aiAction.movingType; 

      const triggerMsg = await handleCalculatePrice(aiAction, session);
      const followUp = await chat.sendMessage(triggerMsg);
      session.history = await chat.getHistory();
      await sendMessageBackToUser(facebookId, followUp.response.text().replace(/[*_#]/g, ''));
      return true;
    }

    if (aiAction.action === 'REQUEST_DISCOUNT') {
      const triggerMsg = await handleRequestDiscount(aiAction);
      const followUp = await chat.sendMessage(triggerMsg);
      session.history = await chat.getHistory();
      await sendMessageBackToUser(facebookId, followUp.response.text().replace(/[*_#]/g, ''));
      return true;
    }

    if (aiAction.action === 'CREATE_ORDER') {
      if (!session.surveyDataCache) {
        await sendMessageBackToUser(facebookId, 'Dạ anh/chị cho em xin lại địa chỉ chính xác để em tính giá trước khi lên hợp đồng nhé ạ.');
        return true;
      }
      const replyMessage = await handleCreateOrder(aiAction, session, facebookId);
      await sendMessageBackToUser(facebookId, replyMessage);
      facebookService.clearMemory(facebookId);
      session.isCleared = true; 
      return true;
    }
  } catch (error) {
    console.error('[Action Error]', error);
    await sendMessageBackToUser(facebookId, 'Dạ hệ thống đang xử lý tác vụ này bị lỗi, em đã báo kỹ thuật. Anh/chị đợi chút nhé!');
    return true;
  }
  return false;
}

// Queue xử lý FB Messages
const userMessageQueues = new Map();
async function processNextMessage(facebookId) { /* Giữ nguyên Queue của bạn */ }

// ==============================================================
// 3. MAIN MESSAGE HANDLER (Giải quyết History & Message Limit)
// ==============================================================
async function _processSingleUserMessage(facebookId, messageText, imageUrl) {
  let session = await ChatSession.findOne({ facebookId });
  if (!session) session = new ChatSession({ facebookId, history: [], messageCount: 0 });

  // Bỏ hàm isSpamOrTooShort thủ công, hãy để AI tự trả lời tự nhiên.
  
  // Nới lỏng giới hạn 20 tin nhắn cứng nhắc
  const MAX_QUOTA = parseInt(process.env.MAX_AI_MESSAGES) || 40;
  if ((session.messageCount || 0) > MAX_QUOTA && !session.calculatedPriceResult) {
    return sendMessageBackToUser(facebookId, `Dạ để được hỗ trợ nhanh và chính xác nhất, anh/chị vui lòng để lại Số điện thoại hoặc truy cập web để nhân viên gọi lại tư vấn nhé ạ!`);
  }

  await sendTypingIndicator(facebookId, true);


  if (session.history.length > 40) {
    session.history = session.history.slice(-40);
  }

  
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: buildDynamicSystemPrompt(session),
    safetySettings: safetySettings
  });
  
  const chat = model.startChat({ history: session.history });

  // Quét ảnh
  let finalMessage = messageText || '';
  if (imageUrl) {
    await sendMessageBackToUser(facebookId, 'Dạ em đang quét ảnh, anh/chị đợi xíu nhé! ⏳');
    const visionResult = await processIncomingImage(imageUrl);
    if (visionResult) {
      session.visionItems = [...(session.visionItems || []), ...visionResult.items]; // Nối list đồ đạc
      session.visionWeight = (session.visionWeight || 0) + (visionResult.totalWeight || 0);
      finalMessage += `\n[HỆ THỐNG]: Đã quét ảnh, danh sách đồ: ${visionResult.systemMessage}`;
    }
  }

  // Gọi AI
  let botReply;
  try {
    const result = await chat.sendMessage(finalMessage);
    botReply = result.response.text();
    session.history = await chat.getHistory();
    session.messageCount = (session.messageCount || 0) + 1;
  } catch (err) {
    console.error('[Chat] Lỗi Gemini:', err.message);
    if (err.message.includes('safety')) {
      return sendMessageBackToUser(facebookId, 'Dạ nội dung này vi phạm tiêu chuẩn cộng đồng, em không thể hỗ trợ chủ đề này ạ.');
    }
    return sendMessageBackToUser(facebookId, 'Dạ mạng đang chập chờn, anh/chị nhắn lại giúp em nhé!');
  }

  const handled = await handleAIAction(botReply, session, facebookId, chat);
  if (!handled) {
    await sendMessageBackToUser(facebookId, botReply.replace(/[*_#]/g, ''));
  }

  if (session.isCleared) return; 

  try {
    await ChatSession.findOneAndUpdate(
      { facebookId },
      {
        history: session.history,
        messageCount: session.messageCount,
        visionItems: session.visionItems,
        visionWeight: session.visionWeight,
        surveyDataCache: session.surveyDataCache,
        calculatedPriceResult: session.calculatedPriceResult
      },
      { upsert: true }
    );
  } catch (err) { console.warn('Lỗi lưu Session:', err.message); }
}

const facebookService = {
  processUserMessage: async (facebookId, messageText, imageUrl = null) => {
    if (!userMessageQueues.has(facebookId)) userMessageQueues.set(facebookId, { messages: [], isProcessing: false });
    userMessageQueues.get(facebookId).messages.push({ messageText, imageUrl });
    processNextMessage(facebookId);
  },
  clearMemory: async (facebookId) => { await ChatSession.deleteOne({ facebookId }); }
};

module.exports = facebookService;