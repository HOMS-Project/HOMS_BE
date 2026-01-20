const mongoose = require('mongoose');

const requestTicketSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true
  },

  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  dispatcherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  moveType: {
    type: String,
    enum: ['FULL_HOUSE', 'SPECIFIC_ITEMS'],
    required: true
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

  /* ================= ITEMS ================= */
  // FULL_HOUSE: items có thể rỗng hoặc chỉ mô tả đại diện
  // SPECIFIC_ITEMS: items là nguồn tính giá chính
  items: [{
    name: String,
    quantity: Number,

    dimensions: {
      length: Number, // cm
      width: Number,  // cm
      height: Number  // cm
    },

    weight: Number,   // kg (ước lượng)
    volume: Number,   // m3 (optional – có thể auto calc)

    material: String,
    images: [String],
    notes: String
  }],

  /* ============== ESTIMATION ============== */
  estimatedVolume: Number,     // m3
  estimatedWeight: Number,     // kg
  estimatedDistance: Number,   // km
  carryDistance: Number,       // mét (từ nhà → xe)

  /* ================ SURVEY ================ */
  survey: {
    type: {
      type: String,
      enum: ['ONLINE', 'OFFLINE']
    },
    date: Date,
    status: {
      type: String,
      enum: ['WAITING', 'COMPLETED'],
      default: 'WAITING'
    },
    notes: String
  },

  /* =============== PRICING =============== */
  pricing: {
    quotedPrice: Number,
    customerAccepted: Boolean,
    acceptedAt: Date
  },

  /* ================ STATUS ================ */
  status: {
    type: String,
    enum: [
      'CREATED',
      'WAITING_SURVEY',
      'SURVEYED',
      'PRICE_QUOTED',
      'ACCEPTED',
      'REJECTED',
      'CANCELLED'
    ],
    default: 'CREATED'
  },

  notes: String

}, { timestamps: true });

module.exports = mongoose.model('RequestTicket', requestTicketSchema);
