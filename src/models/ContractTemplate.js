const mongoose = require('mongoose');

const contractTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    content: { type: String, required: true }, // Có thể là HTML với các placeholders như ${customerName}, ${totalPrice}
    // Optionally embed an admin signature image and signer name into the template
    // This image will be copied into generated contracts for display convenience.
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
