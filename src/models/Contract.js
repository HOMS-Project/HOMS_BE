const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
    contractNumber: { type: String, required: true, unique: true }, // Format VNĐ-YYYYMMDD-STT

    templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ContractTemplate',
        required: true
    },

    requestTicketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RequestTicket',
        required: true
    },

    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    content: { type: String, required: true }, // Nội dung HTML sau khi đã bind data thực tế

    status: {
        type: String,
        enum: ['DRAFT', 'SENT', 'SIGNED', 'EXPIRED', 'CANCELLED'],
        default: 'DRAFT'
    },

    // Chữ ký điện tử
    customerSignature: {
            // Trả về chuỗi base64 của chữ ký khách hàng để frontend có thể hiển thị.
            // Lưu ý: trường này trước đó được ẩn khỏi các truy vấn mặc định (select: false).
            // Bỏ `select: false` để API trả dữ liệu chữ ký khi cần (ví dụ trong chi tiết hợp đồng).
            signatureImage: { type: String }, // base64
    signatureImageThumb: String,                     // thumbnail nhỏ để render UI (không mã hóa)
    signedAt: Date,
    ipAddress: String
  },

    adminSignature: {
        signatureImage: String,
        signatureImageThumb: String,
        signedAt: Date,
        signedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        signedByName: String
    },
    encryptedSignedData: { type: String, select: false },
    encryptionIv: { type: String, select: false },
    encryptionAuthTag: { type: String, select: false },
    contentHash: String,

    // Deadline đặt cọc
    depositDeadline: Date,       // null nếu chưa ký; set khi ký xong
    depositDeadlineHours: { type: Number, default: 48 },

    validFrom: Date,
    validUntil: Date,

    notes: String
}, { timestamps: true });
contractSchema.index({ status: 1, depositDeadline: 1 });
module.exports = mongoose.model('Contract', contractSchema);
