const nodemailer = require("nodemailer");

// Prefer new env names required by moving-notification feature.
// Keep fallback for backward compatibility with existing OTP flow.
const EMAIL_USER = process.env.EMAIL_USER || process.env.AUTH_EMAIL;
const EMAIL_PASS = process.env.EMAIL_PASS || process.env.AUTH_PASS;

const createTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });

const ensureEmailConfig = () => {
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error(
      "Missing email configuration. Please set EMAIL_USER and EMAIL_PASS.",
    );
  }
};

const formatVNDateTime = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleString("vi-VN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const sendWithRetry = async ({ to, subject, html }, maxRetries = 1) => {
  ensureEmailConfig();

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const transporter = createTransporter();
      if (attempt === 0) {
        await transporter.verify();
      }

      await transporter.sendMail({
        from: `"HOMS Moving Service" <${EMAIL_USER}>`,
        to,
        subject,
        html,
      });

      return true;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }
  }

  throw lastError;
};

exports.sendMail = async ({ to, subject, html }) => {
  await sendWithRetry({ to, subject, html }, 0);
};

exports.sendStartMovingEmail = async (customerEmail, orderId, startTime) => {
  try {
    if (!customerEmail) {
      return {
        success: false,
        skipped: true,
        message: "Customer email is empty",
      };
    }

    const formattedStartTime = formatVNDateTime(startTime);
    const subject = `HOMS - Đơn hàng ${orderId} đã bắt đầu vận chuyển`;
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
        <div style="background: #0f766e; color: #ffffff; padding: 18px 22px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; font-size: 20px;">HOMS Moving Service</h2>
        </div>
        <div style="border: 1px solid #d1d5db; border-top: 0; padding: 22px; border-radius: 0 0 12px 12px; background: #ffffff;">
          <p style="margin-top: 0;">Kính gửi Quý khách,</p>
          <p>
            Chúng tôi xin thông báo rằng đơn hàng vận chuyển của Quý khách hiện đã được nhân viên của HOMS bắt đầu thực hiện và đang trên đường đến địa điểm giao nhận.
          </p>

          <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 14px 16px; margin: 14px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Thông tin đơn hàng:</strong></p>
            <p style="margin: 0;">• Mã đơn hàng: <strong>${orderId}</strong></p>
            <p style="margin: 0;">• Thời gian bắt đầu: <strong>${formattedStartTime}</strong></p>
          </div>

          <p>
            Đội ngũ của chúng tôi đang tiến hành vận chuyển một cách cẩn thận và chuyên nghiệp nhằm đảm bảo tài sản của Quý khách được an toàn tuyệt đối.
          </p>
          <p>
            Nếu Quý khách cần hỗ trợ hoặc có bất kỳ thắc mắc nào, vui lòng liên hệ với chúng tôi qua hệ thống hoặc hotline.
          </p>

          <p style="margin-bottom: 0;">
            Trân trọng,<br />
            <strong>HOMS Moving Service</strong>
          </p>
        </div>
      </div>
    `;

    await sendWithRetry({ to: customerEmail, subject, html }, 1);

    return {
      success: true,
      skipped: false,
    };
  } catch (error) {
    console.error("[EmailService] sendStartMovingEmail failed:", error.message);
    return {
      success: false,
      skipped: false,
      message: error.message,
    };
  }
};

exports.sendCompletedEmail = async (
  customerEmail,
  orderId,
  completedTime,
) => {
  try {
    if (!customerEmail) {
      return {
        success: false,
        skipped: true,
        message: "Customer email is empty",
      };
    }

    const formattedCompletedTime = formatVNDateTime(completedTime);
    const subject = `HOMS - Đơn hàng ${orderId} đã hoàn tất`;
    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; color: #1f2937; line-height: 1.6;">
        <div style="background: #14532d; color: #ffffff; padding: 18px 22px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; font-size: 20px;">HOMS Moving Service</h2>
        </div>
        <div style="border: 1px solid #d1d5db; border-top: 0; padding: 22px; border-radius: 0 0 12px 12px; background: #ffffff;">
          <p style="margin-top: 0;">Kính gửi Quý khách,</p>
          <p>
            Chúng tôi xin thông báo rằng đơn hàng vận chuyển của Quý khách đã được hoàn tất thành công.
          </p>

          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 10px; padding: 14px 16px; margin: 14px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Thông tin đơn hàng:</strong></p>
            <p style="margin: 0;">• Mã đơn hàng: <strong>${orderId}</strong></p>
            <p style="margin: 0;">• Thời gian hoàn tất: <strong>${formattedCompletedTime}</strong></p>
          </div>

          <p>
            Chúng tôi hy vọng Quý khách hài lòng với dịch vụ của HOMS. Mọi ý kiến đóng góp của Quý khách sẽ giúp chúng tôi cải thiện chất lượng dịch vụ tốt hơn trong tương lai.
          </p>
          <p>
            Xin chân thành cảm ơn Quý khách đã tin tưởng và sử dụng dịch vụ của chúng tôi.
          </p>

          <p style="margin-bottom: 0;">
            Trân trọng,<br />
            <strong>HOMS Moving Service</strong>
          </p>
        </div>
      </div>
    `;

    await sendWithRetry({ to: customerEmail, subject, html }, 1);

    return {
      success: true,
      skipped: false,
    };
  } catch (error) {
    console.error("[EmailService] sendCompletedEmail failed:", error.message);
    return {
      success: false,
      skipped: false,
      message: error.message,
    };
  }
};