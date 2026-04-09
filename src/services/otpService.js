// services/otpService.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendMail } = require('./emailService');

// Store chung cho mọi loại OTP — key: `${type}:${id}`
// Production nên dùng Redis
const otpStore = new Map();

const OTP_TEMPLATES = {
  CONTRACT_SIGN: (otp, customerName) => ({
    subject: '🔐 Mã OTP xác nhận ký hợp đồng HOMS',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;
                  border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
        <div style="background: #2D4F36; padding: 24px; text-align: center;">
          <h2 style="color: white; margin: 0;">HOMS Vận Chuyển</h2>
        </div>
        <div style="padding: 32px;">
          <p>Xin chào <strong>${customerName}</strong>,</p>
          <p>Mã OTP xác nhận <strong>ký hợp đồng điện tử</strong> của bạn:</p>
          <div style="text-align: center; margin: 32px 0;">
            <span style="font-size: 40px; font-weight: bold; letter-spacing: 12px;
                         color: #2D4F36; background: #f0f7f1; padding: 16px 24px;
                         border-radius: 8px; border: 2px dashed #2D4F36;">
              ${otp}
            </span>
          </div>
          <p style="color: #e74c3c; text-align: center;">⏱ Mã hết hạn sau <strong>5 phút</strong></p>
          <p style="color: #888; font-size: 13px;">Nếu bạn không thực hiện thao tác này, hãy bỏ qua email.</p>
        </div>
      </div>`
  }),

  // Tái sử dụng luôn các loại OTP khác nếu cần sau này
  REGISTER: (otp, customerName) => ({
    subject: 'Xác thực đăng ký tài khoản - HOMS System',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #44624A;">Xác thực đăng ký HOMS</h2>
        <p>Xin chào <b>${customerName}</b>,</p>
        <p>Mã OTP xác thực của bạn là:</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0;">
          <h1 style="color: #44624A; letter-spacing: 5px; margin: 0;">${otp}</h1>
        </div>
        <p>Mã có hiệu lực trong <b>1 phút</b>.</p>
      </div>`
  }),

  FORGOT_PASSWORD: (otp) => ({
    subject: 'Mã OTP đặt lại mật khẩu - HOMS System',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #44624A;">Đặt lại mật khẩu HOMS</h2>
        <p>Mã OTP đặt lại mật khẩu của bạn:</p>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0;">
          <h1 style="color: #44624A; letter-spacing: 5px; margin: 0;">${otp}</h1>
        </div>
        <p>Mã có hiệu lực trong <b>1 phút</b>.</p>
      </div>`
  })
};

const TTL = {
  CONTRACT_SIGN: 5 * 60 * 1000,  // 5 phút
  REGISTER: 1 * 60 * 1000,        // 1 phút
  FORGOT_PASSWORD: 1 * 60 * 1000  // 1 phút
};

/**
 * Sinh, hash và gửi OTP
 * @param {string} type     - 'CONTRACT_SIGN' | 'REGISTER' | 'FORGOT_PASSWORD'
 * @param {string} id       - contractId, email, userId... (key định danh)
 * @param {string} email    - Địa chỉ gửi đến
 * @param {string} name     - Tên hiển thị trong mail
 */
exports.sendOtp = async (type, id, email, name = '') => {
  const otp = crypto.randomInt(100000, 999999).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = Date.now() + (TTL[type] || TTL.REGISTER);

  otpStore.set(`${type}:${id}`, { hashedOtp, expiresAt, email });

  const template = OTP_TEMPLATES[type]?.(otp, name);
  if (!template) throw new Error(`Loại OTP không hợp lệ: ${type}`);

  await sendMail({ to: email, ...template });
  console.log(`✅ OTP [${type}] sent to ${email}`);

  return { expiresAt };
};

/**
 * Xác minh OTP — tự động xóa sau khi dùng
 */
exports.verifyOtp = async (type, id, inputOtp) => {
  const key = `${type}:${id}`;
  const record = otpStore.get(key);

  if (!record) throw new Error('OTP không tồn tại hoặc đã được sử dụng');
  if (Date.now() > record.expiresAt) {
    otpStore.delete(key);
    throw new Error('Mã OTP đã hết hạn');
  }

  const isValid = await bcrypt.compare(inputOtp.trim(), record.hashedOtp);
  if (!isValid) throw new Error('Mã OTP không chính xác');

  otpStore.delete(key); 
  return true;
};