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
        signatureImage: String, // URL/Base64 của hình ảnh chữ ký
        signedAt: Date,
        ipAddress: String
    },

    adminSignature: {
        signatureImage: String,
        signedAt: Date,
        signedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },

    validFrom: Date,
    validUntil: Date,

    notes: String
}, { timestamps: true });

module.exports = mongoose.model('Contract', contractSchema);
