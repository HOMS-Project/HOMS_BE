const axios = require('axios');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const { processIncomingImage } = require('./visionService');
const { handleCalculatePrice, handleRequestDiscount, handleCreateOrder } = require('./orderActionService');

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY);
const ChatSession = require('../models/ChatSession');
const FRONTEND_URL = process.env.FRONTEND_URL;
const uploadToCloudinary = (buffer) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: "customer_uploads",
              fetch_format: "auto",
              quality: "auto",
              transformation: [
            { width: 1200, crop: "limit" } 
        ]
            },
            
            (error, result) => {
                if (error) return reject(error);
                resolve(result.secure_url);
            }
        );
        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};
// ==============================================================
// 1. SYSTEM PROMPT ĐỘNG (BƠM TRẠNG THÁI VÀO PROMPT ĐỂ AI KHÔNG QUÊN)
// ==============================================================
function buildDynamicSystemPrompt(session) {
    const currentMoveType = session.surveyDataCache?.movingType || 'Chưa chọn (BẮT BUỘC HỎI KHÁCH)';
    const today = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'long' }) + ' (GMT+7)';
  // Lấy dữ liệu đã thu thập bơm vào Prompt để dù có cắt history AI cũng không quên
  const collectedData = `
    [TRẠNG THÁI HIỆN TẠI CỦA KHÁCH HÀNG - BẮT BUỘC GHI NHỚ]:
      [THÔNG TIN HỆ THỐNG]: Hôm nay là ${today}.
    - Lựa chọn dịch vụ hiện tại: ${currentMoveType}
    - Đồ đạc đã quét/nhận diện: ${session.visionItems?.length ? JSON.stringify(session.visionItems) : 'Chưa có'}
    - Đã báo giá chưa: ${session.calculatedPriceResult ? 'Đã báo giá' : 'Chưa báo giá'}
  `;

  return `
    <ROLE>
    Bạn là Trợ lý AI của HOMS - Tư vấn viên dịch vụ chuyển nhà, thuê xe tải thân thiện. LUÔN TỰ XƯNG LÀ AI.
    Nhiệm vụ: Tư vấn, báo giá, xin email và chốt đơn để chờ điều phối viên xem xét .
    QUY TẮC SỐ 1: Phải xác định rõ khách hàng đang chọn 1 trong 3 dịch vụ: 
    - Thuê xe tải (TRUCK_RENTAL)
    - Chuyển đồ lẻ (SPECIFIC_ITEMS)
    - Chuyển nhà trọn gói (FULL_HOUSE)
    NẾU KHÁCH CHƯA CHỌN, BẠN BẮT BUỘC PHẢI HỎI KHÁCH CHỌN DỊCH VỤ TRƯỚC KHI TƯ VẤN THÊM.
    </ROLE>
    ${collectedData}
     <SERVICE_GUIDE & KNOWLEDGE_BASE>
  HOMS cung cấp 3 dịch vụ chuyên biệt. AI BẮT BUỘC phải hành xử khác nhau tùy theo dịch vụ khách chọn:

  1. TRUCK_RENTAL (Thuê xe tải): 
  - ĐẶC ĐIỂM: Khách tự bốc xếp. Chỉ thuê xe và tài xế. Có thể chọn thêm dịch vụ bổ sung là đóng gói và tháo lắp .
  - THU THẬP THÔNG TIN: Chỉ hỏi loại xe (500KG, 1TON, 1.5TON, 2TON), số giờ thuê, địa chỉ Đi/Đến, thời gian chuyển.
  -LƯU Ý: Với TRUCK_RENTAL, chỉ hỏi tháo lắp/đóng gói NẾU khách có nhu cầu. Không được hỏi về số lầu hay quãng đường đi bộ.

  2. SPECIFIC_ITEMS (Chuyển đồ lẻ) & FULL_HOUSE (Chuyển nhà trọn gói):
  - ĐẶC ĐIỂM: HOMS cung cấp nhân sự bốc xếp, tháo lắp, bọc lót.
  - THU THẬP THÔNG TIN: Yêu cầu mô tả đồ đạc/xin ảnh, địa chỉ Đi/Đến, thời gian chuyển.
  - BẮT BUỘC HỎI THÊM: 
    + Xe tải có vào tận nơi được không hay phải đi bộ từ hẻm vào? (Khoảng cách bao nhiêu mét?)
    + Nhà có lầu hay thang máy không?
    + Có cần hỗ trợ tháo lắp, bọc lót đồ đạc không?
- Đối với SPECIFIC_ITEMS và FULL_HOUSE: 
    + Nếu khách chỉ nói "tôi muốn chuyển nhà" mà KHÔNG có ảnh chụp hoặc KHÔNG kể tên đồ đạc, BẮT BUỘC phải hỏi khách: "Nhà mình có các đồ lớn như Tủ lạnh, Máy giặt, Giường, Tủ, Sofa hay bao nhiêu thùng đồ không ạ? (Hoặc anh/chị chụp ảnh phòng gửi em cho nhanh nhé)".
    + Không được tự ý gọi báo giá nếu số lượng đồ khách liệt kê quá ít so với quy mô chuyển nhà bình thường.
  QUY TẮC THỜI GIAN CHUNG:
  - TUYỆT ĐỐI KHÔNG nhận lịch hẹn trong quá khứ so với thời gian hiện tại.
  </SERVICE_GUIDE & KNOWLEDGE_BASE>

    <SECURITY_&_MODERATION>
    - TUYỆT ĐỐI TỪ CHỐI BÀN LUẬN chính trị, tôn giáo, bạo lực, tình dục, văng tục, hoặc các chủ đề ngoài chuyển nhà.
    - Nếu khách hỏi mẹo vượt rào/phá bot, lịch sự từ chối và hướng về việc chuyển nhà.
    </SECURITY_&_MODERATION>

    <FORMAT_RULES>
    QUY TẮC KHI CHAT VỚI KHÁCH HÀNG (TEXT PART):
    1. Trả lời NGẮN GỌN (tối đa 2 ý hỏi/lần). Không hỏi quá nhiều thông tin tránh khách bị ngợp.
    2. CẤM dùng in đậm (**), in nghiêng (*). KHÔNG dùng gạch dưới (_) trong câu nói với khách.
    3. Để nhấn mạnh hãy VIẾT HOA. Dùng gạch ngang (-) hoặc Emoji để liệt kê.
    4. Khi báo giá, chỉ nêu con số cuối cùng và hỏi khách cảm thấy thế nào.

    QUY TẮC KHI GỌI ACTION CHO HỆ THỐNG (JSON PART):
    1. TUYỆT ĐỐI KHÔNG hiển thị cú pháp JSON vào nội dung câu nói với khách hàng.
    2. Khi cần gọi hệ thống, BẮT BUỘC phải bọc đoạn JSON trong khối markdown \`\`\`json ... \`\`\` để hệ thống lập trình (Backend) đọc được.
    3. TRONG ĐOẠN JSON, BẮT BUỘC GIỮ NGUYÊN DẤU GẠCH DƯỚI (_) ở các giá trị: CALCULATE_PRICE, REQUEST_DISCOUNT, CREATE_ORDER, TRUCK_RENTAL, SPECIFIC_ITEMS, FULL_HOUSE.
    QUY TẮC QUAN TRỌNG KHI GỌI CALCULATE_PRICE:
- Phần text TRƯỚC JSON TUYỆT ĐỐI CHỈ được nói: "Để em tính giá cho mình nhé ạ!" hoặc tương tự.
- NGHIÊM CẤM viết bất kỳ con số tiền nào (VD: 2.500.000, 1.000.000...) trong phần text này.
- Giá CHỈ được nói SAU KHI hệ thống trả về [GIÁ_THỰC_TẾ_TỪ_HỆ_THỐNG].
    </FORMAT_RULES>

    <STEPS>
    BƯỚC 1: Nếu chưa có 'Dịch vụ khách chọn', hãy chào mừng và yêu cầu khách chọn 1 trong 3 dịch vụ. 
    - Không dùng câu chào dài dòng kiểu CSKH, không dùng "rất vui được hỗ trợ".
    - Trả lời ngắn, tự nhiên, giống người thật. Ưu tiên câu hỏi trực tiếp. 
    
  BƯỚC 2: Thu thập thông tin theo đúng <SERVICE_GUIDE> ở trên tùy thuộc vào dịch vụ đang chọn. Nhớ lấy đủ địa chỉ ĐI và ĐẾN chi tiết tại Đà Nẵng, và thời gian dự kiến chuyển.
       
BƯỚC 3: Nếu thiếu thông tin bắt buộc, hãy hỏi tiếp (Tối đa 2 ý/lần).
KIỂM TRA ĐIỀU KIỆN TRƯỚC KHI GỌI JSON:
- Trước khi gọi JSON CALCULATE_PRICE, bạn phải tự kiểm tra trong trí nhớ: Đã có đủ 'Địa chỉ Đi', 'Địa chỉ Đến', 'Thời gian chuyển' chưa?
- Nếu thiếu dù chỉ 1 trường, BẮT BUỘC hỏi thêm khách. KHÔNG ĐƯỢC gọi JSON nếu thiếu dữ liệu.
[QUY TẮC TẠO JSON CALCULATE_PRICE]:
  \`\`\`json
  {
   "email": "email_khach_hang@gmail.com"
    "action": "CALCULATE_PRICE",
    "movingType": "TRUCK_RENTAL", 
    "data": { 
      "from": "Địa chỉ đi", 
      "to": "Địa chỉ đến",
      "movingTime": "2024-04-25T08:00:00+07:00",
      "items": [], 
      "floors": 0, 
      "hasElevator": false, 
      "carryMeter": 0, 
      "needsPacking": false, 
      "needsAssembling": false,
      "suggestedVehicle": "1TON", 
      "rentalDurationHours": 2,
      "suggestedStaffCount": 1
    }
  }
  \`\`\`
QUY TẮC ĐIỀN DATA:
Nếu là TRUCK_RENTAL: Cần điền needsPacking/needsAssembling (nếu khách yêu cầu), suggestedVehicle, rentalDurationHours. Bỏ qua floors, hasElevator, carryMeter, items.
Nếu là SPECIFIC_ITEMS hoặc FULL_HOUSE: Cần điền items, floors, hasElevator, carryMeter, needsPacking, needsAssembling. Bỏ qua suggestedVehicle, rentalDurationHours.
movingTime BẮT BUỘC có đuôi +07:00.

BƯỚC 4: Báo giá cho khách một cách NGẮN GỌN nhất. Nếu khách chê đắt, dùng action REQUEST_DISCOUNT.
QUY TẮC BÁO GIÁ:
- TUYỆT ĐỐI KHÔNG tự bịa ra con số nếu chưa có "GIÁ_THỰC_TẾ_TỪ_HỆ_THỐNG".
- Nếu chưa có dữ liệu từ hệ thống, chỉ được nói "Em đang tính toán, đợi em chút nhé".
- Khi hệ thống trả về JSON hoặc kết quả báo giá, BẮT BUỘC dùng đúng con số đó. Không làm tròn hay thay đổi.
- Khi hệ thống đã trả về con số và bạn đã gửi cho khách, BẠN KHÔNG ĐƯỢC PHÉP nhắc lại con số đó ở các tin nhắn tiếp theo trừ khi khách hỏi lại. Nếu khách chưa hỏi lại giá, chỉ tập trung hỏi khách "Anh/chị có muốn chốt đơn không?".
BƯỚC 5: Khách chốt đơn -> BẮT BUỘC xin Email -> Gọi action CREATE_ORDER (chỉ xuất JSON chứa email, kèm câu báo khách đợi hệ thống xử lý, KHÔNG bảo khách check mail).
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
async function handleAIAction(botReply, session, facebookId, chat,clearMemory) {
  let jsonString = null;
  let textPart = botReply;
  const mdMatch = botReply.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (mdMatch) {
    jsonString = mdMatch[1];
    textPart = botReply.replace(mdMatch[0], '').trim();
  } else {
    const firstIdx = botReply.indexOf('{');
    const lastIdx = botReply.lastIndexOf('}');
    if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx && botReply.includes('"action"')) {
      jsonString = botReply.substring(firstIdx, lastIdx + 1);
      
      const textBefore = botReply.substring(0, firstIdx).trim();
      const textAfter = botReply.substring(lastIdx + 1).trim();
      
      textPart = (textBefore + "\n" + textAfter).trim();
    }
  }
  if (!jsonString) return false;

  let aiAction;
  try {
    aiAction = JSON.parse(jsonString); 
  
    if(aiAction.action === 'CALCULATEPRICE') aiAction.action = 'CALCULATE_PRICE';
    if(aiAction.action === 'REQUESTDISCOUNT') aiAction.action = 'REQUEST_DISCOUNT';
    if(aiAction.action === 'CREATEORDER') aiAction.action = 'CREATE_ORDER';

    if(aiAction.movingType === 'TRUCKRENTAL') aiAction.movingType = 'TRUCK_RENTAL';
    if(aiAction.movingType === 'SPECIFICITEMS') aiAction.movingType = 'SPECIFIC_ITEMS';
    if(aiAction.movingType === 'FULLHOUSE') aiAction.movingType = 'FULL_HOUSE';

  } 
  catch (err) { 
    console.error('[JSON Parse Error]', err.message, '\nRaw JSON bị lỗi:', jsonString);
    if (textPart) {
      await sendMessageBackToUser(facebookId, textPart.replace(/[*_#]/g, ''));
    }
    await chat.sendMessage("JSON bạn vừa tạo bị lỗi cú pháp, vui lòng kiểm tra lại cấu trúc dấu ngoặc.");
    return true; 
  }

  // 5. Gửi phần Text mào đầu (VD: "Mình sẽ gửi yêu cầu...") cho khách hàng
  if (textPart) {
    await sendMessageBackToUser(facebookId, textPart.replace(/[*_#]/g, ''));
  }

  try {
    // ---- XỬ LÝ CALCULATE_PRICE ----
 if (aiAction.action === 'CALCULATE_PRICE') {
    if (!session.surveyDataCache) session.surveyDataCache = {};
    const requiredFields = ['from', 'to', 'movingTime'];
    const missing = requiredFields.filter(f => !aiAction.data[f]);

    if (missing.length > 0) {
        await chat.sendMessage(`Hệ thống thiếu thông tin: ${missing.join(', ')}. Hãy hỏi khách hàng các thông tin này.`);
        await sendMessageBackToUser(facebookId, "Dạ mình còn thiếu một vài thông tin quan trọng (Địa chỉ/Thời gian), anh/chị cho em xin lại nhé ạ!");
        return true;
    }

    session.surveyDataCache.movingType = aiAction.movingType;

    // 1. Lấy giá và câu lệnh từ hệ thống
    const systemResult = await handleCalculatePrice(aiAction, session);

    // 2. NẾU HỆ THỐNG BÁO LỖI (Ví dụ: sai địa chỉ, thời gian quá khứ)
    if (systemResult.includes('[HỆ_THỐNG_BÁO_LỖI]')) {
        const followUp = await chat.sendMessage(`Hệ thống từ chối tính giá với lỗi: "${systemResult}". Đóng vai CSKH, hãy xin lỗi và khéo léo hỏi lại khách thông tin bị sai.`);
        session.history = await chat.getHistory();
        await sendMessageBackToUser(facebookId, followUp.response.text().replace(/[*_#]/g, ''));
        return true;
    }

    // 3. ĐƯA KẾT QUẢ CHO AI ĐỂ AI TỰ TRẢ LỜI KHÁCH HÀNG (SỬA LỖI Ở ĐÂY)
    const promptToAI = `${systemResult}\n\n[QUY TẮC LÚC NÀY]: Bạn hãy dùng con số ở trên để báo giá cho khách một cách tự nhiên, thân thiện. Cuối câu BẮT BUỘC hỏi: "Anh/chị có đồng ý với mức giá này để em lên đơn luôn cho mình không ạ?"`;
    
    // Yêu cầu AI soạn câu trả lời
    const followUp = await chat.sendMessage(promptToAI);
    
    // Gửi câu trả lời mượt mà của AI cho khách
    await sendMessageBackToUser(facebookId, followUp.response.text().replace(/[*_#]/g, ''));
    
    // 4. Cập nhật lịch sử
    session.history = await chat.getHistory();
    return true;
}
    // ---- XỬ LÝ REQUEST_DISCOUNT ----
    if (aiAction.action === 'REQUEST_DISCOUNT') {
      const triggerMsg = await handleRequestDiscount(aiAction);
      const followUp = await chat.sendMessage(triggerMsg);
      session.history = await chat.getHistory();
      await sendMessageBackToUser(facebookId, followUp.response.text().replace(/[*_#]/g, ''));
      return true;
    }

    // ---- XỬ LÝ CREATE_ORDER ----
    if (aiAction.action === 'CREATE_ORDER') {
      if (!session.surveyDataCache) {
        await sendMessageBackToUser(facebookId, 'Dạ anh/chị cho em xin lại địa chỉ chính xác để em tính giá cho đơn của mình nhé ạ.');
        return true;
      }
         const email = aiAction.email; 
    
    if (!email) {
        await sendMessageBackToUser(facebookId, 'Dạ anh/chị vui lòng xác nhận lại địa chỉ email để em lưu đơn hàng nhé ạ!');
        return true;
    }

    session.surveyDataCache.email = email;

      const replyMessage = await handleCreateOrder(aiAction, session, facebookId);
      if (replyMessage.includes('[HỆ_THỐNG_BÁO]') || replyMessage.toLowerCase().includes('lỗi')) {
        const systemPromptToAI = `Hệ thống vừa trả về lỗi khi tạo đơn: "${replyMessage}". 
        Dựa vào lỗi này, hãy đóng vai nhân viên chăm sóc khách hàng:
        1. Xin lỗi khách hàng.
        2. Báo lỗi một cách tự nhiên, lịch sự (KHÔNG output nguyên văn [HỆ_THỐNG_BÁO]).
        3. Xin khách hàng một email/thông tin khác để tiếp tục.`;
        
        const followUp = await chat.sendMessage(systemPromptToAI);
        session.history = await chat.getHistory();     
        await sendMessageBackToUser(facebookId, followUp.response.text().replace(/[*_#]/g, ''));
        return true; 
      }
      
      await sendMessageBackToUser(facebookId, replyMessage);
       await clearMemory(facebookId);
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
  
  if (!queue || queue.messages.length === 0 || queue.isProcessing) {
    return;
  }

  // 1. Khóa queue
  queue.isProcessing = true; 
  
  // 2. LẤY TẤT CẢ tin nhắn hiện có ra để gộp (Batching)
  const batchMessages = [...queue.messages];
  queue.messages = []; // Làm rỗng queue
  
  let combinedText = "";
  let lastText = "";
  let combinedImageUrl = null;

  // Gộp các tin nhắn lại
  for (const msg of batchMessages) {
      const currentText = msg.messageText?.trim().toLowerCase();
      
      // Chống spam: Bỏ qua nếu câu hiện tại giống hệt câu liền trước đó
      if (msg.messageText && currentText !== lastText) {
          combinedText += (combinedText ? "\n" : "") + msg.messageText.trim();
          lastText = currentText;
      }
      
      // Nếu có ảnh, lấy ảnh (Có thể lấy ảnh cuối cùng nếu khách gửi nhiều ảnh)
      if (msg.imageUrl) {
          combinedImageUrl = msg.imageUrl; 
      }
  }

  try {
    // 3. Chỉ gọi AI nếu có text hoặc có ảnh sau khi đã lọc
    if (combinedText || combinedImageUrl) {
        await _processSingleUserMessage(facebookId, combinedText, combinedImageUrl);
    }
  } catch (err) {
    console.error(`[LỖI HÀNG ĐỢI] User ${facebookId}:`, err);
  } finally {
    // 4. Mở khóa queue
    queue.isProcessing = false;
    
    // Nếu trong lúc AI đang rep (mất 5-10s), khách lại chat thêm, thì gọi đệ quy để xử lý tiếp
    if (queue.messages.length > 0) {
        processNextMessage(facebookId); 
    }
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
 if (!session.surveyDataCache) session.surveyDataCache = {};

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
    temperature: 0.8,     
  },
    });
    const chat = model.startChat({ history: session.history || [] });

    // Quét ảnh (nếu có)
    let finalMessage = messageText || '';
    if (imageUrl) {
      console.log(`[DEBUG] 4.1. Đang quét ảnh...`);
      await sendMessageBackToUser(facebookId, 'Dạ em đang quét ảnh, anh/chị đợi xíu nhé! ⏳');
       const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const cloudinaryUrl = await uploadToCloudinary(Buffer.from(response.data));
    session.surveyDataCache.images = session.surveyDataCache.images || [];
    session.surveyDataCache.images.push(cloudinaryUrl);
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
   const handled = await handleAIAction(
  botReply, session, facebookId, chat,
  (id) => ChatSession.deleteOne({ facebookId: id }) 
);
    
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
       userMessageQueues.delete(facebookId);
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
    if (!userMessageQueues.has(facebookId)) {
        userMessageQueues.set(facebookId, { messages: [], isProcessing: false, timer: null });
    }
   
    const queue = userMessageQueues.get(facebookId);
    queue.messages.push({ messageText, imageUrl });
    if (queue.timer) {
        clearTimeout(queue.timer);
    }
    queue.timer = setTimeout(() => {
        processNextMessage(facebookId);
    }, 2500); 
  },
  clearMemory: async (facebookId) => { await ChatSession.deleteOne({ facebookId }); }
};

module.exports = facebookService;