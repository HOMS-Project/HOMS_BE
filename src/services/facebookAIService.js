const axios = require('axios');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
 const User = require('../models/User'); 
const RequestTicket = require('../models/RequestTicket');
const { processIncomingImages } = require('./visionService');
const { handleCalculatePrice, handleRequestDiscount, handleCreateOrder,generateMagicLinkForUser } = require('./orderActionService');

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
                resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    resourceType: result.resource_type || 'image'
                });
              }
        );
        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
};
// ==============================================================
// 1. SYSTEM PROMPT ĐỘNG (BƠM TRẠNG THÁI VÀO PROMPT ĐỂ AI KHÔNG QUÊN)
// ==============================================================
function buildDynamicSystemPrompt(session) {
  const currentMoveType = session.surveyDataCache?.movingType || 'CHƯA CHỌN';
  const today = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'long' }) + ' (GMT+7)';
  const collectedItems = session.visionItems?.length ? JSON.stringify(session.visionItems) : 'Chưa có';
  
  return `
<CONTEXT>
Hôm nay là: ${today}.
Trạng thái khách hàng:
- Dịch vụ đang chọn: ${currentMoveType}
- Đồ đạc đã nhận diện: ${collectedItems}
- Đã báo giá chưa: ${session.calculatedPriceResult ? 'Rồi' : 'Chưa'}
- Đơn hàng gần nhất: ${session.lastOrderId || 'Chưa có'}
</CONTEXT>

<ROLE>
Bạn là Trợ lý AI của HOMS - Chuyên viên tư vấn chuyển nhà và thuê xe tải tại Đà Nẵng.
Tính cách: Thân thiện, chuyên nghiệp, tự xưng là "AI" hoặc "em", gọi khách là "anh/chị".
Mục tiêu: Xác định dịch vụ -> Thu thập thông tin -> Báo giá -> Xin SĐT/Email -> Chốt đơn.
</ROLE>

<KNOWLEDGE>
HOMS có 3 dịch vụ BẮT BUỘC khách phải chọn 1 trước khi tư vấn sâu:

1. TRUCK_RENTAL (Thuê xe tải): 
- Đặc điểm: Khách tự bốc xếp.
- Cần hỏi: Loại xe (500KG, 1TON, 1.5TON, 2TON), số giờ thuê, Địa chỉ Đi/Đến, Thời gian.
- Dịch vụ bổ sung (BẮT BUỘC HỎI THÊM): "Anh/chị có cần bên em hỗ trợ người để Tháo lắp giường tủ hay Đóng gói đồ đạc không ạ?"
- TUYỆT ĐỐI KHÔNG hỏi số lầu hay khoảng cách đi bộ từ hẻm.

2. SPECIFIC_ITEMS (Chuyển đồ lẻ) & 3. FULL_HOUSE (Chuyển nhà trọn gói): 
- Đặc điểm: HOMS cung cấp nhân sự bốc xếp.
- BẮT BUỘC HỎI ĐỦ: Danh sách đồ (hoặc xin ảnh) + Địa chỉ Đi/Đến + Thời gian + Nhà có lầu/thang máy không + Hẻm xe tải vào tận nơi được không (cách mấy mét) + Có cần hỗ trợ Đóng gói, Tháo lắp không.
</KNOWLEDGE>

<WORKFLOW>
Bước 1: Nếu [Dịch vụ đang chọn] là CHƯA CHỌN, hãy hỏi khách muốn dùng dịch vụ nào (1 trong 3).
Bước 2: Thu thập thông tin theo <KNOWLEDGE>. Hỏi ngắn gọn, tối đa 2 ý/lần. 
Bước 3: Tự động chuyển đổi thời gian tương đối (ngày mai, mốt...) sang chuẩn ISO (YYYY-MM-DD). Nếu khách nói chung chung, phải hỏi ngày cụ thể. Tuyệt đối không nhận lịch trong quá khứ.
Bước 4: Khi ĐÃ ĐỦ THÔNG TIN (Địa chỉ Đi, ĐĐ Đến, Thời gian chuyển), sử dụng Action \`CALCULATE_PRICE\`.
Bước 5: Khi khách chốt đơn, xin SĐT và Email, sau đó sử dụng Action \`CREATE_ORDER\`.
</WORKFLOW>

<ACTIONS>
Khi cần hệ thống xử lý, BẮT BUỘC xuất ra một block Markdown JSON (không bọc trong thẻ khác) theo chuẩn sau:

1. Tính giá (Chỉ gọi khi ĐỦ ĐIỀU KIỆN ở Bước 4):
Text phản hồi khách: "Dạ để em tính giá cho mình nhé ạ!" (TUYỆT ĐỐI KHÔNG BỊA CON SỐ NÀO Ở ĐÂY).
\`\`\`json
{
  "action": "CALCULATE_PRICE",
  "movingType": "TRUCK_RENTAL | SPECIFIC_ITEMS | FULL_HOUSE",
  "data": { 
    "from": "Địa chỉ đi", "to": "Địa chỉ đến", "movingTime": "YYYY-MM-DDTHH:mm:00+07:00",
    "items": [], "floors": 0, "hasElevator": false, "carryMeter": 0, 
    "needsPacking": false, "needsAssembling": false, 
    "suggestedVehicle": "1TON", "rentalDurationHours": 2
  }
}
\`\`\`
[QUY TẮC ĐIỀN DATA BẮT BUỘC]:
- Nếu TRUCK_RENTAL: Phải điền needsPacking, needsAssembling (nếu khách có yêu cầu), suggestedVehicle, rentalDurationHours. Bỏ qua floors, carryMeter, items.
- Nếu SPECIFIC_ITEMS/FULL_HOUSE: Phải điền items, floors, hasElevator, carryMeter, needsPacking, needsAssembling. Bỏ qua suggestedVehicle, rentalDurationHours.

2. Tạo đơn (Chỉ gọi khi có Email & Phone của khách):
Text phản hồi khách: "Dạ em đang tạo đơn cho mình, anh/chị đợi vài giây nhé!"
\`\`\`json
{ "action": "CREATE_ORDER", "email": "abc@gmail.com", "phone": "0912345678" }
\`\`\`

3. Xin giảm giá:
\`\`\`json
{ "action": "REQUEST_DISCOUNT" }
\`\`\`

4. Lấy lại link đơn hàng:
\`\`\`json
{ "action": "GET_NEW_LINK" }
\`\`\`
</ACTIONS>

<CONSTRAINTS>
1. Giao tiếp: Ngắn gọn. KHÔNG dùng in đậm (**), in nghiêng (*), gạch dưới (_). Dùng gạch ngang (-) hoặc emoji để liệt kê.
2. Báo giá: KHI VÀ CHỈ KHI hệ thống trả về biến [GIÁ_THỰC_TẾ_TỪ_HỆ_THỐNG] (Ví dụ: X VNĐ), bạn MỚI được báo giá. Cú pháp bắt buộc: "Mức giá dự kiến khoảng từ (X - 500.000) đến (X + 500.000) VNĐ". Nhấn mạnh đây là giá tạm tính.
3. Bảo mật: Từ chối bàn luận chính trị, tôn giáo, bạo lực, tình dục, hoặc mẹo vượt rào bot.
4. Khuyến mãi: Bạn không thể áp mã cho khách, chỉ có thể thể báo mã cho khách để khách tự nhập ở web
5. Lấy lại link: NẾU khách yêu cầu "gửi lại link", lập tức gọi action \`GET_NEW_LINK\`.
</CONSTRAINTS>
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
  
    // 1. CHUẨN HÓA CÁC ACTION BỊ MẤT DẤU GẠCH DƯỚI (Thêm GETNEWLINK)
    if(aiAction.action === 'CALCULATEPRICE') aiAction.action = 'CALCULATE_PRICE';
    if(aiAction.action === 'REQUESTDISCOUNT') aiAction.action = 'REQUEST_DISCOUNT';
    if(aiAction.action === 'CREATEORDER') aiAction.action = 'CREATE_ORDER';
    if(aiAction.action === 'GETNEWLINK') aiAction.action = 'GET_NEW_LINK'; // <--- DÒNG SỬA LỖI MỚI THÊM

    if(aiAction.movingType === 'TRUCKRENTAL') aiAction.movingType = 'TRUCK_RENTAL';
    if(aiAction.movingType === 'SPECIFICITEMS') aiAction.movingType = 'SPECIFIC_ITEMS';
    if(aiAction.movingType === 'FULLHOUSE') aiAction.movingType = 'FULL_HOUSE';


    if (aiAction.action === 'GET_NEW_LINK') {
      
      if (textPart) {
        await sendMessageBackToUser(facebookId, textPart.replace(/[*_#]/g, ''));
      }

      const user = await User.findOne({ facebookId });
      if (user && user.password) {
        await sendMessageBackToUser(facebookId, "Dạ hệ thống báo anh/chị đã thiết lập mật khẩu trước đó rồi ạ. Mình truy cập vào đây để đăng nhập xem đơn nhé: " + FRONTEND_URL + "/login\n\n(Nếu lỡ quên mật khẩu, anh/chị cứ bấm 'Quên mật khẩu' trên web nhé!)");
      }
      else {
        const link = await generateMagicLinkForUser(facebookId, session.lastOrderId);
        if (!link) {
          await sendMessageBackToUser(facebookId, "Dạ em chưa tìm thấy tài khoản của mình trên hệ thống. Anh/chị cho em xin email để em kiểm tra lại nhé!");
        } else {
          await sendMessageBackToUser(facebookId, `Dạ đây là link truy cập đơn hàng (bảo mật) dành riêng cho anh/chị ạ: ${link}\n\nLưu ý: Link này sẽ tự động hết hạn sau 10 phút nhé!`);
        }
      }
      return true; 
    }

  } catch (err) { 
    console.error('[JSON Parse Error]', err.message, '\nRaw JSON bị lỗi:', jsonString);
    if (textPart) {
      await sendMessageBackToUser(facebookId, textPart.replace(/[*_#]/g, ''));
    }
    await chat.sendMessage("JSON bạn vừa tạo bị lỗi cú pháp, vui lòng kiểm tra lại cấu trúc dấu ngoặc.");
    return true; 
  }

  // 5. Gửi phần Text mào đầu 
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
    const promptToAI = `${systemResult}\n\n[QUY TẮC LÚC NÀY]: Bạn hãy dùng con số ở trên để báo giá cho khách một cách tự nhiên. TUYỆT ĐỐI KHÔNG tự ý trừ tiền khuyến mãi vào mức giá này. KHÔNG ĐƯỢC nói là đã áp mã giảm giá. Hãy dặn khách là họ sẽ tự nhập mã giảm giá (nếu có) trên link hệ thống sau khi chốt đơn. Cuối câu BẮT BUỘC hỏi khách có đồng ý chốt đơn không.`;
    
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
      const systemResult = await handleRequestDiscount(aiAction);
      const promptToAI = `${systemResult}\n\n[QUY TẮC LÚC NÀY]: Hãy đóng vai nhân viên CSKH, sử dụng thông tin trên để trả lời khách hàng một cách tự nhiên, thân thiện và lịch sự nhất. Cuối câu hãy khéo léo hỏi khách có muốn tiếp tục chốt đơn không.`;
      const followUp = await chat.sendMessage(promptToAI);
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
  let combinedImageUrls = [];

  // Gộp các tin nhắn lại
  for (const msg of batchMessages) {
      const currentText = msg.messageText?.trim().toLowerCase();
      
      // Chống spam: Bỏ qua nếu câu hiện tại giống hệt câu liền trước đó
      if (msg.messageText && currentText !== lastText) {
          combinedText += (combinedText ? "\n" : "") + msg.messageText.trim();
          lastText = currentText;
      }
      
     if (msg.imageUrls && msg.imageUrls.length > 0) {
        combinedImageUrls.push(...msg.imageUrls); 
    }
  }

  try {
    // 3. Chỉ gọi AI nếu có text hoặc có ảnh sau khi đã lọc
   if (combinedText || combinedImageUrls.length > 0) {
    await _processSingleUserMessage(facebookId, combinedText, combinedImageUrls);
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
async function _processSingleUserMessage(facebookId, messageText, imageUrls) {
  console.log(`[DEBUG] 👉 Bắt đầu xử lý cho user: ${facebookId}`);

  try {
    // BƯỚC 1: Lấy session từ DB
    console.log(`[DEBUG] 1. Đang truy vấn DB lấy session...`);
    let session = await ChatSession.findOne({ facebookId });
    if (!session) {
      console.log(`[DEBUG] 1.1. User mới, tạo session mới.`);
      session = new ChatSession({ facebookId, history: [], messageCount: 0 });
  const user = await User.findOne({ facebookId });
      if (user) {
         const lastTicket = await RequestTicket.findOne({ customerId: user._id }).sort({ createdAt: -1 });
         if (lastTicket) {
             session.lastOrderId = lastTicket._id;
         }
      }
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
    if (imageUrls.length > 0) {
        console.log(`[DEBUG] 4.1. Đang quét ${imageUrls.length} ảnh...`);
        await sendMessageBackToUser(facebookId, 'Dạ em đang quét ảnh, anh/chị đợi xíu nhé! ⏳');
  let newUploadedUrls = [];
      session.surveyDataCache.images = session.surveyDataCache.images || [];
          for (const imageUrl of imageUrls) {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
           const cloudinaryObj = await uploadToCloudinary(Buffer.from(response.data));
             session.surveyDataCache.images.push(cloudinaryObj);
             newUploadedUrls.push(cloudinaryObj.url); 
        }

          if (newUploadedUrls.length > 0) {
            console.log(`[DEBUG] Tiến hành AI Vision cho ${newUploadedUrls.length} ảnh...`);
            const visionResult = await processIncomingImages(newUploadedUrls);
            session.visionItems = [...(session.visionItems || []), ...visionResult.items];
            session.visionWeight = (session.visionWeight || 0) + (visionResult.totalWeight || 0);
            finalMessage += `\n[HỆ THỐNG]: Đã quét ảnh mới, danh sách đồ: ${visionResult.systemMessage}`;
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
   sendTextMessage: async (facebookId, text) => {
    return await sendMessageBackToUser(facebookId, text);
  },
  processUserMessage: async (facebookId, messageText, imageUrls = []) => {
    if (!userMessageQueues.has(facebookId)) {
        userMessageQueues.set(facebookId, { messages: [], isProcessing: false, timer: null });
    }
   
    const queue = userMessageQueues.get(facebookId);
    queue.messages.push({ messageText, imageUrls }); 
    if (queue.timer) {
        clearTimeout(queue.timer);
    }
    queue.timer = setTimeout(() => {
        processNextMessage(facebookId);
    }, 3000); 
  },
  clearMemory: async (facebookId) => { await ChatSession.deleteOne({ facebookId }); }
};

module.exports = facebookService;