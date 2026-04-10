const { GoogleGenerativeAI } = require("@google/generative-ai");
const adminStatisticService = require("../../services/admin/statisticService");
const moment = require("moment");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Lấy phân tích kinh doanh từ AI (Weekly & Monthly)
 */
const getBusinessInsight = async (req, res) => {
  try {
    const today = moment().format("YYYY-MM-DD");
    const sevenDaysAgo = moment().subtract(7, "days").format("YYYY-MM-DD");
    const thirtyDaysAgo = moment().subtract(30, "days").format("YYYY-MM-DD");

    // Lấy dữ liệu 7 ngày qua
    const weeklyRevenue = await adminStatisticService.getRevenueStats({
      startDate: sevenDaysAgo,
      endDate: today,
      period: "daily",
    });
    const weeklyOrders = await adminStatisticService.getRequestTicketsDaily({
      startDate: sevenDaysAgo,
      endDate: today,
    });

    // Lấy dữ liệu 30 ngày qua
    const monthlyRevenue = await adminStatisticService.getRevenueStats({
      startDate: thirtyDaysAgo,
      endDate: today,
      period: "daily",
    });
    const monthlyOrders = await adminStatisticService.getRequestTicketsDaily({
      startDate: thirtyDaysAgo,
      endDate: today,
    });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemInstruction = `
Bạn là một chuyên gia phân tích dữ liệu kinh doanh cao cấp cho hệ thống HOMS (House Moving System).
Nhiệm vụ của bạn là đọc dữ liệu doanh thu và đơn hàng, sau đó đưa ra bản tóm tắt phân tích thông minh bằng tiếng Việt.

YÊU CẦU:
1. Phân tích phải trực quan, sử dụng Bullet points và Emoji.
2. Nêu bật các xu hướng (tăng/giảm), các ngày đột biến và đưa ra dự báo/lời khuyên ngắn gọn.
3. Chia làm 2 phần: [PHÂN TÍCH TUẦN QUA] và [PHÂN TÍCH THÁNG QUA].
4. Ngôn ngữ chuyên nghiệp nhưng dễ hiểu cho Admin.

Dữ liệu Tuần (7 ngày):
Doanh thu: ${JSON.stringify(weeklyRevenue)}
Đơn hàng: ${JSON.stringify(weeklyOrders)}

Dữ liệu Tháng (30 ngày):
Doanh thu: ${JSON.stringify(monthlyRevenue)}
Đơn hàng: ${JSON.stringify(monthlyOrders)}
`;

    const result = await model.generateContent(systemInstruction);
    const text = result.response.text();

    res.status(200).json({
      success: true,
      data: text,
    });
  } catch (error) {
    console.error("AI Insight Error:", error);
    res.status(500).json({ error: "Không thể khởi tạo phân tích AI." });
  }
};

/**
 * Tự động tạo mẫu hợp đồng bằng AI
 */
const generateTemplateContent = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Vui lòng mô tả mẫu hợp đồng cần tạo." });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemInstruction = `
Bạn là chuyên gia pháp lý và vận hành của HOMS. Hãy tạo một mẫu hợp đồng vận chuyển chuyên nghiệp dựa trên yêu cầu của người dùng.
YÊU CẦU:
1. Trả về DUY NHẤT mã HTML (không có Markdown block \`\`\`html).
2. Nội dung rõ ràng, đầy đủ các điều khoản bảo hiểm, bồi thường, trách nhiệm.
3. Sử dụng các Placeholders sau để hệ thống tự điền dữ liệu:
   - \${customerName}: Tên khách hàng
   - \${customerPhone}: Số điện thoại
   - \${pickupAddress}: Địa chỉ đi
   - \${deliveryAddress}: Địa chỉ đến
   - \${totalPrice}: Tổng chi phí
   - \${scheduledTime}: Thời gian vận chuyển
   - \${contractNumber}: Số hợp đồng
4. Phong cách trình bày trang trọng (Times New Roman style).

Yêu cầu cụ thể của Admin: ${prompt}
`;

    const result = await model.generateContent(systemInstruction);
    const text = result.response.text().replace(/```html|```/g, "").trim();

    res.status(200).json({
      success: true,
      data: text,
    });
  } catch (error) {
    console.error("AI Template Error:", error);
    res.status(500).json({ error: "Không thể tạo mẫu bằng AI." });
  }
};

/**
 * Phân tích cảm xúc và tóm tắt đánh giá
 */
const getFeedbackSummary = async (req, res) => {
  try {
    const ratingService = require("../../services/admin/ratingService");
    const ratings = await ratingService.getAllRatings({ limit: 50 }); // Lấy 50 cái gần nhất

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemInstruction = `
Bạn là Quản lý chất lượng dịch vụ của HOMS. Đọc các đánh giá sau của khách hàng và tóm tắt:
1. 🎯 Phân loại cảm xúc tổng quát (Tích cực/Tiêu cực/Trung tính).
2. ✅ Những điểm khách hàng hài lòng nhất.
3. ⚠️ Những vấn đề khách hàng hay phàn nàn và cần xử lý ngay.
4. 💡 Đề xuất hành động để cải thiện chất lượng.

Định dạng: Sử dụng Markdown, Emojis, dễ đọc.

Dữ liệu đánh giá: ${JSON.stringify(ratings.ratings)}
`;

    const result = await model.generateContent(systemInstruction);
    const text = result.response.text();

    res.status(200).json({
      success: true,
      data: text,
    });
  } catch (error) {
    console.error("AI Feedback Error:", error);
    res.status(500).json({ error: "Không thể phân tích phản hồi bằng AI." });
  }
};

/**
 * Gợi ý chương trình khuyến mãi thông minh
 */
const getPromotionAdvice = async (req, res) => {
  try {
    const today = moment().format("YYYY-MM-DD");
    const sevenDaysAgo = moment().subtract(7, "days").format("YYYY-MM-DD");

    // Lấy dữ liệu 7 ngày qua để tìm "điểm trũng" đơn hàng
    const weeklyRevenue = await adminStatisticService.getRevenueStats({
      startDate: sevenDaysAgo,
      endDate: today,
      period: "daily",
    });
    const weeklyOrders = await adminStatisticService.getRequestTicketsDaily({
      startDate: sevenDaysAgo,
      endDate: today,
    });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemInstruction = `
Bạn là chuyên gia Marketing và Tối ưu hóa doanh thu cho HOMS.
Dựa trên dữ liệu đơn hàng 7 ngày qua, hãy gợi ý một chương trình khuyến mãi thông minh để kích cầu vào những ngày thấp điểm.

DỮ LIỆU ĐƠN HÀNG:
Doanh thu: ${JSON.stringify(weeklyRevenue)}
Số đơn: ${JSON.stringify(weeklyOrders)}

YÊU CẦU:
1. Xác định rõ những ngày/thời điểm nào lượng đơn hàng đang thấp.
2. Đề xuất 01 mã khuyến mãi cụ thể (Tên mã, Loại giảm giá, Giá trị).
3. Giải thích ngắn gọn tại sao khuyến mãi này giúp tối ưu hóa hiệu suất xe tải và nhân lực.
4. Trình bày bằng Markdown, sử dụng Emojis.

Ví dụ: "Mã TUESDAY-HAPPY: Giảm 15% cho các đơn hàng đặt vào Thứ 3 vì đây là ngày lượng đơn thấp nhất tuần..."
`;

    const result = await model.generateContent(systemInstruction);
    const text = result.response.text();

    res.status(200).json({
      success: true,
      data: text,
    });
  } catch (error) {
    console.error("AI Promotion Error:", error);
    res.status(500).json({ error: "Không thể lấy gợi ý khuyến mãi từ AI." });
  }
};

module.exports = {
  getBusinessInsight,
  generateTemplateContent,
  getFeedbackSummary,
  getPromotionAdvice
};
