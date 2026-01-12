const mongoose = require('mongoose');

const serviceRatingSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  ratingType: {
    type: String,
    enum: ['Service', 'Driver', 'Vehicle'],
    required: true
  },

  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },

  categories: {
    cleanliness: {
      type: Number,
      min: 1,
      max: 5
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 5
    },
    punctuality: {
      type: Number,
      min: 1,
      max: 5
    },
    communication: {
      type: Number,
      min: 1,
      max: 5
    },
    safety: {
      type: Number,
      min: 1,
      max: 5
    }
  },

  comment: String,

  images: [String],

  status: {
    type: String,
    enum: ['Active', 'Flagged', 'Deleted'],
    default: 'Active'
  },

  ratedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('ServiceRating', serviceRatingSchema);
