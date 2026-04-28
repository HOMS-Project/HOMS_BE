const facebookService = require('../services/facebookAIService'); // Thay lại đường dẫn cho đúng dự án của bạn

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'homs_bi_mat_123';

const processedMids = new Set();

const facebookController = {
  verifyWebhook: (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WEBHOOK_VERIFIED');
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  },

handleIncomingWebhook: async (req, res) => {
    const body = req.body;
    
    if (body.object !== 'page') return res.sendStatus(404);
    res.status(200).send('EVENT_RECEIVED');

    try {
      for (const entry of body.entry) {
        if (!entry.messaging) continue;

        for (const webhookEvent of entry.messaging) {
          const senderId = webhookEvent.sender.id;
          const message = webhookEvent.message;
          
          if (!message || message.is_echo) continue;

        
          if (message.mid) {
            if (processedMids.has(message.mid)) continue;
            processedMids.add(message.mid);
            if (processedMids.size > 5000) processedMids.clear();
          }

          let messageText = message.text || null;
          let imageUrls = []; 
          let hasUnsupportedContent = false;

          // 2. Xử lý Attachments (Validation)
          if (message.attachments?.length > 0) {
            for (const attachment of message.attachments) {
              // Chặn Video & File lạ ngay lập tức
              if (['video', 'file', 'audio'].includes(attachment.type)) {
                hasUnsupportedContent = true;
                break; 
              }

              if (attachment.type === 'image') {
                const url = attachment.payload?.url || '';
                const isSticker = attachment.payload?.sticker_id || 
                                  url.includes('stickers') || 
                                  url.includes('369239266556155') || 
                                  url.includes('851557_');

                if (!isSticker && url) {
                  imageUrls.push(url);
                }
              }
            }
          }

          // 3. Phản hồi cho khách nếu gửi Video/File
          if (hasUnsupportedContent) {
            console.log(`[FB] Khách ${senderId} gửi nội dung không hỗ trợ (Video/File).`);
            await facebookService.sendTextMessage(senderId, "Dạ em chào anh/chị, hiện tại hệ thống AI của bên em chỉ hỗ trợ phân tích hình ảnh đồ đạc. Anh/chị vui lòng gửi ảnh món đồ cần vận chuyển nhé, em cảm ơn ạ! 😊");
            continue;
          }

          // 4. Validate nội dung (Bỏ qua Like/Sticker thuần túy)
          if (messageText === '(y)' || messageText === '👍') continue;
          
          // Tạo text giả nếu chỉ gửi ảnh
          if (imageUrls.length > 0 && !messageText) {
            messageText = '[Khách hàng vừa gửi ảnh đồ đạc]';
          }

          // Bỏ qua nếu không có cả chữ lẫn ảnh
          if (!messageText && imageUrls.length === 0) {
            console.log(`[FB] Bỏ qua vì không có nội dung hợp lệ từ ${senderId}`);
            continue;
          }
if (message.reply_to) {
 
  messageText = `[Khách hàng trả lời tin nhắn trước]: ${messageText || ''}`;
}

          // 5. Gửi vào Service xử lý
          console.log(`[FB] Xử lý tin từ ${senderId}: Text=${messageText ? 'Yes' : 'No'}, Ảnh=${imageUrls.length}`);
          facebookService.processUserMessage(senderId, messageText, imageUrls)
            .catch(err => console.error(`[FB] Lỗi service cho ${senderId}:`, err));
        }
      }
    } catch (error) {
      console.error('[FB] Lỗi xử lý webhook:', error);
    }
  },
};

module.exports = facebookController;