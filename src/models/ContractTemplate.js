const mongoose = require('mongoose');

const contractTemplateSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,
    content: { type: String, required: true }, // Có thể là HTML với các placeholders như ${customerName}, ${totalPrice}
    isActive: { type: Boolean, default: true },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('ContractTemplate', contractTemplateSchema);
