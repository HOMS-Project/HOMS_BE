const mongoose = require('mongoose');

const surveyDataSchema = new mongoose.Schema({
  requestTicketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RequestTicket',
    required: true,
    unique: true
  },

  surveyType: {
    type: String,
    enum: ['OFFLINE', 'ONLINE'],
    required: true
  },

  status: {
    type: String,
    enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
    default: 'SCHEDULED'
  },

  scheduledDate: Date,
  completedDate: Date,

  items: [{
    name: String,
    quantity: { type: Number, default: 1 },
    notes: String,
    isSpecialItem: { type: Boolean, default: false },
    requiresManualHandling: { type: Boolean, default: false },
    actualWeight: Number,
    actualDimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    actualVolume: Number,
    condition: {
      type: String,
      enum: ['GOOD', 'DAMAGED', 'FRAGILE']
    },
    notes: String
  }],

  totalActualWeight: Number,
  totalActualVolume: Number,
  totalActualItems: Number,

  /* ===== ƯỚC TÍNH TÀI NGUYÊN ===== */
  suggestedVehicle: {
    type: String,
    enum: ['500KG', '1TON', '1.5TON', '2TON']
  },

  suggestedStaffCount: {
    type: Number,
    min: 1
  },

  estimatedHours: Number,
  estimatedPrice: Number,

  distanceKm: Number,
  carryMeter: { type: Number, default: 0 },

  floors: { type: Number, default: 0 },
  hasElevator: { type: Boolean, default: false },

  needsAssembling: { type: Boolean, default: false },
  needsPacking: { type: Boolean, default: false },
  insuranceRequired: { type: Boolean, default: false },
  declaredValue: Number,

  surveyorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  notes: String,
  images: [String]

}, { timestamps: true });

module.exports = mongoose.model('SurveyData', surveyDataSchema);