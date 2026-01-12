const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  code: { type: String, unique: true },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  dispatcherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  pickup: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  delivery: {
    address: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },

  scheduledTime: Date,

  services: {
    packing: Boolean,
    assembling: Boolean,
    insurance: Boolean
  },

  items: [{
    name: String,
    quantity: Number,
    weight: Number,
    fragile: Boolean,
    images: [String],
    note: String
  }],

  pricing: {
    estimatedDistance: Number,
    totalWeight: Number,
    basePrice: Number,
    serviceFee: Number,
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Promotion'
    },
    discountCode: String,
    discountAmount: Number,
    totalPrice: Number
  },

  status: {
    type: String,
    enum: [
      'Created',
      'Confirmed',
      'Assigned',
      'Pickup',
      'InTransit',
      'Delivered',
      'Completed',
      'Cancelled'
    ],
    default: 'Created'
  },

  assignment: {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
    driverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assignedAt: Date
  },

  photos: {
    pickupBefore: [String],
    pickupAfter: [String],
    deliveryBefore: [String],
    deliveryAfter: [String]
  },

  payment: {
    method: {
      type: String,
      enum: ['COD', 'Card', 'Wallet', 'Bank Transfer'],
      default: 'COD'
    },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
      default: 'Pending'
    },
    paidAt: Date,
    transactionId: String
  },

  timeline: [{
    status: String,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedAt: Date
  }],

  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    driverRating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    ratedAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
