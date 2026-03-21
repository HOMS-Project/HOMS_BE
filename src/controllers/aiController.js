const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const chat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Initialize the model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Define context prompt to guide the AI
    const systemInstruction = 
      "Bạn là một trợ lý ảo chăm sóc khách hàng thân thiện và chuyên nghiệp cho dịch vụ chuyển nhà HOMS. HOMS giúp khách hàng đặt lịch chuyển nhà, theo dõi tiến trình và thanh toán. Bạn hãy trả lời các câu hỏi ngắn gọn, dễ hiểu và tư vấn nhiệt tình. Câu hỏi: ";

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
