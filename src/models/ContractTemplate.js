const mongoose = require('mongoose');

const contractTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    content: { type: String, required: true }, // Có thể là HTML với các placeholders như ${customerName}, ${totalPrice}
    adminSignature: {
        signatureImage: String,       // base64 or data URI
        signatureImageThumb: String,  // optional thumbnail
        signedByName: String,
        signedAt: Date
    },
    isActive: { type: Boolean, default: true },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('ContractTemplate', contractTemplateSchema);
