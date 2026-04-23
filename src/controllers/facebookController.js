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
    
    if (body.object !== 'page') {
      return res.sendStatus(404);
    }

    res.status(200).send('EVENT_RECEIVED');

    try {
      for (const entry of body.entry) {
        if (!entry.messaging) continue;

        for (const webhookEvent of entry.messaging) {
          if (!webhookEvent?.message) continue;

          const senderId = webhookEvent.sender.id;
          const message = webhookEvent.message;
          
          if (message.is_echo) continue;

          if (message.mid) {
            if (processedMids.has(message.mid)) continue;
            processedMids.add(message.mid);
            if (processedMids.size > 5000) processedMids.clear();
          }

          console.log(`[FB] Bắt đầu xử lý tin nhắn từ ${senderId}:`, message.text);

          let messageText = message.text || null;
          let imageUrls = []; 

          // ── Xử lý attachments (Chặn triệt để Icon Like) ───────────
          if (message.attachments?.length > 0) {
            for (const attachment of message.attachments) {
              if (attachment.type === 'image') {
                const url = attachment.payload?.url || '';
                
                const isSticker = attachment.payload?.sticker_id || 
                                  url.includes('stickers') || 
                                  url.includes('369239266556155') || 
                                  url.includes('851557_');

                if (isSticker) {
                  console.log(`[FB] Khách ${senderId} gửi Sticker/Like. Bỏ qua.`);
                  continue; 
                }

          
                if (url) {
                  imageUrls.push(url);
                  console.log(`📸 Ảnh lấy được từ ${senderId}: ${url.substring(0, 50)}...`);
                }
              }
            }
            
            // Nếu có ảnh mà không có chữ, thêm text giả định
            if (imageUrls.length > 0 && !messageText) {
              messageText = '[Khách hàng vừa gửi ảnh đồ đạc]';
            }
          }

          if (messageText === '(y)' || messageText === '👍') {
            continue;
          }

          // Bỏ qua nếu không có cả chữ lẫn ảnh
          if (!messageText && imageUrls.length === 0) {
            console.log(`[FB] Bỏ qua vì không có nội dung từ ${senderId}`);
            continue;
          }

          // SỬA: Truyền mảng imageUrls vào service
          facebookService.processUserMessage(senderId, messageText, imageUrls)
            .catch(err => console.error(`[FB] Lỗi khi xử lý tin nhắn của ${senderId}:`, err));
        }
      }
    } catch (error) {
      console.error('[FB] Lỗi xử lý webhook:', error);
    }
  },
};

module.exports = facebookController;