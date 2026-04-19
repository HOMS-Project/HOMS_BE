/**
 * facebookController.js
 *
 * Thay đổi chính:
 *  - Extract imageUrl thật từ Facebook attachment và truyền vào processUserMessage
 *  - Xử lý đúng các trường hợp: text, ảnh, ảnh + text, icon like / file khác
 */

const facebookService = require('../services/facebookAIService');

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || 'homs_bi_mat_123';

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

    // Facebook yêu cầu trả 200 ngay, không được để timeout
    if (body.object !== 'page') {
      return res.sendStatus(404);
    }

    res.status(200).send('EVENT_RECEIVED');

    // Xử lý bất đồng bộ sau khi đã trả 200
    try {
      for (const entry of body.entry) {
        if (!entry.messaging) continue;

        for (const webhookEvent of entry.messaging) {
          if (!webhookEvent?.message) continue;

          const senderId = webhookEvent.sender.id;
          const message = webhookEvent.message;
          const mid = message.mid;

          // Bỏ qua echo (tin nhắn từ chính page gửi đi)
          if (message.is_echo) continue;

          let messageText = message.text || null;
          let imageUrl = null;

          // ── Xử lý attachments ─────────────────────
          if (message.attachments?.length > 0) {
            for (const attachment of message.attachments) {
              if (attachment.type === 'image') {
                // Lấy URL ảnh thật từ Facebook
                imageUrl = attachment.payload?.url || null;
                console.log(`📸 Ảnh từ ${senderId}: ${imageUrl}`);
                // Nếu khách chỉ gửi ảnh mà không kèm text
                if (!messageText) {
                  messageText = '[Khách hàng vừa gửi ảnh đồ đạc]';
                }
                break; // Chỉ xử lý ảnh đầu tiên
              }
            }

            // Attachment không phải ảnh (file, video, sticker like, audio...)
            if (!imageUrl && !messageText) {
              console.log(`[FB] Bỏ qua attachment không phải ảnh từ ${senderId}`);
              continue;
            }
          }

          // Không có gì để xử lý (quick reply chưa có text, ...)
          if (!messageText) {
            console.log(`[FB] Bỏ qua message không có text/image từ ${senderId}`);
            continue;
          }

          // ── Ném vào service xử lý ─────────────────
          await facebookService.processUserMessage(senderId, messageText, imageUrl, mid);
        }
      }
    } catch (error) {
      console.error('[FB] Lỗi xử lý webhook:', error);
    }
  },
};

module.exports = facebookController;