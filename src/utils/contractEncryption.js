// utils/contractEncryption.js
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const SECRET_KEY = Buffer.from(process.env.CONTRACT_ENCRYPTION_KEY, 'hex');

/**
 * Mã hóa nội dung hợp đồng
 * @returns {{ encryptedData, iv, authTag }} — tất cả là hex string
 */
function encryptContract(plainText) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag(); 

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Giải mã nội dung hợp đồng (chỉ dùng nội bộ, không expose ra API)
 */
function decryptContract({ encryptedData, iv, authTag }) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    SECRET_KEY,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encryptContract, decryptContract };