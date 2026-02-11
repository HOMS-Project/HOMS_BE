const mongoose = require('mongoose');

const serviceRatingSchema = new mongoose.Schema({
  // [FIX]: Đánh giá cho Invoice nào
  invoiceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Invoice', 
    required: true 
  },
  
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Có thể đánh giá riêng từng đối tượng
  driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },

  rating: { type: Number, min: 1, max: 5, required: true }, // Điểm tổng quan
  
  // Chi tiết tiêu chí
  categories: {
    cleanliness: { type: Number, min: 1, max: 5 },
    professionalism: { type: Number, min: 1, max: 5 },
    punctuality: { type: Number, min: 1, max: 5 } // Đúng giờ không?
  },

  comment: String,
  images: [String] // Ảnh feedback (nếu có)
}, { timestamps: true });

module.exports = mongoose.model('ServiceRating', serviceRatingSchema);