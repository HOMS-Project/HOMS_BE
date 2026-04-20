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
    const currentMoveType = session.surveyDataCache?.movingType || 'Chưa chọn (BẮT BUỘC HỎI KHÁCH)';
  // Lấy dữ liệu đã thu thập bơm vào Prompt để dù có cắt history AI cũng không quên
  const collectedData = `
    [TRẠNG THÁI HIỆN TẠI CỦA KHÁCH HÀNG - BẮT BUỘC GHI NHỚ]:
    - Lựa chọn dịch vụ hiện tại: ${currentMoveType}
    - Đồ đạc đã quét/nhận diện: ${session.visionItems?.length ? JSON.stringify(session.visionItems) : 'Chưa có'}
    - Đã báo giá chưa: ${session.calculatedPriceResult ? 'Đã báo giá' : 'Chưa báo giá'}
  `;

  return `
    <ROLE>
    Bạn là Trợ lý AI của HOMS - Tư vấn viên dịch vụ chuyển nhà, thuê xe tải thân thiện. LUÔN TỰ XƯNG LÀ AI.
    Nhiệm vụ: Tư vấn, báo giá, xin email và chốt đơn hợp đồng.
    QUY TẮC SỐ 1: Phải xác định rõ khách hàng đang chọn 1 trong 3 dịch vụ: 
    - Thuê xe tải (TRUCK_RENTAL)
    - Chuyển đồ lẻ (SPECIFIC_ITEMS)
    - Chuyển nhà trọn gói (FULL_HOUSE)
    NẾU KHÁCH CHƯA CHỌN, BẠN BẮT BUỘC PHẢI HỎI KHÁCH CHỌN DỊCH VỤ TRƯỚC KHI TƯ VẤN THÊM.
    </ROLE>
    ${collectedData}
      <SERVICE_GUIDE>
  1. Thuê xe tải (Mã: TRUCK_RENTAL): Khách tự bốc xếp.
    2. Chuyển đồ lẻ (Mã: SPECIFIC_ITEMS): Có nhân viên hỗ trợ bê đồ nặng.
    3. Chuyển nhà trọn gói (Mã: FULL_HOUSE): HOMS làm hết từ A-Z.
    </SERVICE_GUIDE>
    <KNOWLEDGE_BASE>
    QUAN TRỌNG: HOMS cung cấp 3 dịch vụ hoàn toàn khác nhau. 
    1. CÁC DỊCH VỤ:
       - TRUCK_RENTAL (Thuê xe tải): Khách tự bốc xếp, chỉ thuê xe. (Rẻ nhất).
       - SPECIFIC_ITEMS  (Chuyển đồ lẻ): Thuê xe và có người khiêng 1-2 món đồ lớn.
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
    3. TUYỆT ĐỐI KHÔNG HIỂN THỊ CÁC ĐOẠN JSON CHO KHÁCH HÀNG THẤY.
    4. Trả lời NGẮN GỌN (tối đa 2 ý hỏi/lần). Không hỏi quá nhiều thông tin tránh khách bị ngợp.
    5. Khi báo giá, chỉ nêu con số cuối cùng và hỏi khách cảm thấy thế nào.
    </FORMAT_RULES>

    <STEPS>
    BƯỚC 1: Nếu chưa có 'Dịch vụ khách chọn', hãy chào mừng và yêu cầu khách chọn 1 trong 3 dịch vụ trên. 
    BƯỚC 2: Tùy vào dịch vụ đã chọn:
       - Nếu TRUCK_RENTAL: Chỉ cần hỏi ước lượng đồ nhiều ít (để chọn xe).
       - Nếu SPECIFIC_ITEMS / FULL_HOUSE: Khảo sát đồ chi tiết (xin ảnh).
    BƯỚC 3: Lấy địa chỉ ĐI và ĐẾN cụ thể tại Đà Nẵng.
    BƯỚC 4: Hỏi địa hình (Lầu/Trệt, hẻm, thang máy). Nếu 
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

async function sendTypingIndicator(facebookId, isTyping = true) {
  try {
    await axios.post(
      `https://graph.facebook.com/v25.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      { recipient: { id: facebookId }, sender_action: isTyping ? 'typing_on' : 'typing_off' }
    );
  } catch (_) { }
}
async function sendMessageBackToUser(facebookId, text) {
  if (!PAGE_ACCESS_TOKEN) {
    console.error('[FB] Lỗi: Thiếu PAGE_ACCESS_TOKEN trong .env');
    return;
  }
  if (!text || text.trim().length === 0) {
    console.warn('[FB] Bỏ qua gửi tin nhắn trống cho user:', facebookId);
    return;
  }
  try {
    await axios.post(
      `https://graph.facebook.com/v25.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      { recipient: { id: facebookId }, message: { text } }
    );
  } catch (err) {
    console.error('[FB] Lỗi gửi tin:', err.response?.data || err.message);
  }
}

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
    if(!session.surveyDataCache) session.surveyDataCache = {};
    session.surveyDataCache.movingType = aiAction.movingType; 
    const systemResult = await handleCalculatePrice(aiAction, session);
    const shortPrompt = `Hệ thống tính xong giá là ${systemResult}. 
                         Hãy báo giá này cho khách cực kỳ NGẮN GỌN và hỏi khách có đồng ý không. 
                         Không nhắc lại các thông tin thừa thãi.`;
    
    const followUp = await chat.sendMessage(shortPrompt);
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
      if (replyMessage.includes('[HỆ_THỐNG_BÁO]') || replyMessage.toLowerCase().includes('lỗi')) {
      
        const systemPromptToAI = `Hệ thống vừa trả về lỗi khi tạo đơn: "${replyMessage}". 
        Dựa vào lỗi này, hãy đóng vai nhân viên chăm sóc khách hàng:
        1. Xin lỗi khách hàng.
        2. Báo lỗi một cách tự nhiên, lịch sự (KHÔNG output nguyên văn [HỆ_THỐNG_BÁO]).
        3. Xin khách hàng một email khác để tiếp tục.`;
        
        const followUp = await chat.sendMessage(systemPromptToAI);
        session.history = await chat.getHistory();     
        await sendMessageBackToUser(facebookId, followUp.response.text().replace(/[*_#]/g, ''));
        
       
        return true; 
    }
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
async function processNextMessage(facebookId) {
  const queue = userMessageQueues.get(facebookId);
  
  // Nếu không có queue, queue rỗng, hoặc ĐANG XỬ LÝ tin nhắn trước đó thì dừng lại chờ
  if (!queue || queue.messages.length === 0 || queue.isProcessing) {
    return;
  }

  // 1. Khóa queue lại (để không bị lặp gửi AI 2 lần nếu khách spam phím enter)
  queue.isProcessing = true; 
  
  // 2. Lấy tin nhắn đầu tiên ra khỏi hàng đợi
  const { messageText, imageUrl } = queue.messages.shift();

  try {
    // 3. Gọi hàm xử lý AI chính
    await _processSingleUserMessage(facebookId, messageText, imageUrl);
  } catch (err) {
    console.error(`[LỖI HÀNG ĐỢI] User ${facebookId}:`, err);
  } finally {
    // 4. QUAN TRỌNG NHẤT: Mở khóa queue để xử lý tin nhắn tiếp theo
    queue.isProcessing = false;
    
    // Gọi đệ quy lại chính nó để vét cạn các tin nhắn khách vừa spam lúc bot đang bận
    processNextMessage(facebookId); 
  }
}

// ==============================================================
// 3. MAIN MESSAGE HANDLER (Giải quyết History & Message Limit)
// ==============================================================
async function _processSingleUserMessage(facebookId, messageText, imageUrl) {
  console.log(`[DEBUG] 👉 Bắt đầu xử lý cho user: ${facebookId}`);

  try {
    // BƯỚC 1: Lấy session từ DB
    console.log(`[DEBUG] 1. Đang truy vấn DB lấy session...`);
    let session = await ChatSession.findOne({ facebookId });
    if (!session) {
      console.log(`[DEBUG] 1.1. User mới, tạo session mới.`);
      session = new ChatSession({ facebookId, history: [], messageCount: 0 });
    }

    // BƯỚC 2: Kiểm tra Quota
    const MAX_QUOTA = parseInt(process.env.MAX_AI_MESSAGES) || 40;
    if ((session.messageCount || 0) > MAX_QUOTA && !session.calculatedPriceResult) {
      console.log(`[DEBUG] 2. Quá giới hạn quota tin nhắn.`);
      return await sendMessageBackToUser(facebookId, `Dạ để được hỗ trợ nhanh và chính xác nhất, anh/chị vui lòng để lại Số điện thoại hoặc truy cập web để nhân viên gọi lại tư vấn nhé ạ!`);
    }

    // BƯỚC 3: Gửi hiệu ứng "Đang gõ..."
    console.log(`[DEBUG] 3. Đang gửi sendTypingIndicator...`);
    try {
      await sendTypingIndicator(facebookId, true);
    } catch (fbErr) {
      console.warn(`[CẢNH BÁO] Lỗi sendTypingIndicator, nhưng vẫn cho chạy tiếp:`, fbErr.message);
    }

    // Xử lý History
    if (session.history && session.history.length > 40) {
      session.history = session.history.slice(-40);
    }

    // BƯỚC 4: Khởi tạo Model Gemini
    console.log(`[DEBUG] 4. Đang khởi tạo Model Gemini...`);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildDynamicSystemPrompt(session),
      safetySettings: safetySettings,
      generationConfig: {
    maxOutputTokens: 6000, 
    temperature: 1,     
  },
    });
    const chat = model.startChat({ history: session.history || [] });

    // Quét ảnh (nếu có)
    let finalMessage = messageText || '';
    if (imageUrl) {
      console.log(`[DEBUG] 4.1. Đang quét ảnh...`);
      await sendMessageBackToUser(facebookId, 'Dạ em đang quét ảnh, anh/chị đợi xíu nhé! ⏳');
      const visionResult = await processIncomingImage(imageUrl);
      if (visionResult) {
        session.visionItems = [...(session.visionItems || []), ...visionResult.items];
        session.visionWeight = (session.visionWeight || 0) + (visionResult.totalWeight || 0);
        finalMessage += `\n[HỆ THỐNG]: Đã quét ảnh, danh sách đồ: ${visionResult.systemMessage}`;
      }
    }

    // BƯỚC 5: Gửi tin nhắn cho AI
    console.log(`[DEBUG] 5. Đang gửi tin nhắn tới Gemini: "${finalMessage}"`);
    let botReply;
    try {
      const result = await chat.sendMessage(finalMessage);
      botReply = result.response.text();
      console.log(`[DEBUG] 5.1. Nhận được reply từ Gemini: ${botReply.substring(0, 50)}...`);
      session.history = await chat.getHistory();
      session.messageCount = (session.messageCount || 0) + 1;
    } catch (err) {
      console.error('[LỖI GEMINI CHÍNH]', err);
      if (err.message && err.message.includes('safety')) {
        return await sendMessageBackToUser(facebookId, 'Dạ nội dung này vi phạm tiêu chuẩn cộng đồng, em không thể hỗ trợ chủ đề này ạ.');
      }
      return await sendMessageBackToUser(facebookId, 'Dạ mạng đang chập chờn, anh/chị nhắn lại giúp em nhé!');
    }

    // BƯỚC 6: Xử lý Action JSON
    console.log(`[DEBUG] 6. Đang kiểm tra handleAIAction...`);
    const handled = await handleAIAction(botReply, session, facebookId, chat);
    
    // BƯỚC 7: Nếu AI chỉ chat text bình thường (không có JSON)
    if (!handled) {
      console.log(`[DEBUG] 7. Trả lời text bình thường về cho user...`);
      try {
        await sendMessageBackToUser(facebookId, botReply.replace(/[*_#]/g, ''));
      } catch (fbErr2) {
        console.error(`[LỖI FB API] Không thể gửi tin nhắn cho khách:`, fbErr2.response?.data || fbErr2.message);
      }
    }

    if (session.isCleared) {
      console.log(`[DEBUG] 8. Session đã clear (vừa tạo đơn xong). Kết thúc vòng đời.`);
      return;
    }

    // BƯỚC 8: Lưu DB
    console.log(`[DEBUG] 9. Đang lưu session vào DB...`);
    const cleanHistory = (session.history || []).slice(-30);
    await ChatSession.findOneAndUpdate(
      { facebookId },
      {
       history: cleanHistory,
        messageCount: session.messageCount,
        visionItems: session.visionItems,
        visionWeight: session.visionWeight,
        surveyDataCache: session.surveyDataCache,
        calculatedPriceResult: session.calculatedPriceResult
      },
      { upsert: true }
    );
    console.log(`[DEBUG] ✅ Hoàn thành quy trình cho user: ${facebookId}`);

  } catch (error) {
    console.error(`[CRITICAL ERROR] Tiến trình chết toàn cục tại user ${facebookId}:`, error);
    // Cố gắng cứu vớt bằng cách nhắn khách
    try {
      await sendMessageBackToUser(facebookId, "Dạ hệ thống em đang bảo trì nhẹ, anh/chị thử lại sau vài giây nhé!");
    } catch (e) {}
  }
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