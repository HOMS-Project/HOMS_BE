const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY);

const chat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Initialize the model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Define context prompt to guide the AI
    const systemInstruction = `
Bạn là trợ lý ảo chăm sóc khách hàng của HOMS (House Moving System). 
YÊU CẦU BẮT BUỘC:
1. Bạn PHẢI LUÔN trình bày câu trả lời theo phong cách thu hút, dễ đọc. Hãy sử dụng bullet points (-), biểu tượng cảm xúc (emoji) phù hợp, và in đậm (**) các thông tin quan trọng để làm nổi bật nội dung.
2. Thật ngắn gọn nhưng mang lại giá trị cao nhất (Minimum words, Maximum usefulness).
3. CẤU TRÚC TRẢ LỜI luôn bao gồm 4 phần sau đây (KHÔNG được in ra tên tiếng Anh như CoreAnswer, ContextAwareExplanation... mà phải dùng đúng tên tiếng Việt có emoji và in đậm như mẫu dưới đây):

🎯 **Trọng tâm:** [Câu trả lời cốt lõi trực tiếp nhất cho câu hỏi]
💡 **Chi tiết dịch vụ:** [Giải thích ngắn gọn theo ngữ cảnh dịch vụ HOMS, có thể dùng bullet points ở đây]
✨ **Gợi ý cho bạn:** [Khuyến nghị cá nhân hóa hoặc lưu ý đặc biệt]
👉 **Bước tiếp theo:** [Hành động tiếp theo tốt nhất khách nên thực hiện]

Câu hỏi của khách: `;

    const result = await model.generateContentStream(systemInstruction + message);

    // Set headers for streaming text
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(chunkText);
    }
    
    res.end();

  } catch (error) {
    console.error("AI Chat Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Có lỗi xảy ra khi gọi AI." });
    } else {
      res.end();
    }
  }
};

module.exports = {
  chat
};
