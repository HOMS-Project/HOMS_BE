const mongoose = require('mongoose');

const maintenanceScheduleSchema = new mongoose.Schema({
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },

  maintenanceType: {
    type: String,
    enum: ['Oil Change', 'Tire Replacement', 'Brake Service', 'Engine Inspection', 'Preventive Check', 'Repair', 'Other'],
    required: true
  },

  description: String,

  scheduledStartDate: {
    type: Date,
    required: true
  },

  scheduledEndDate: {
    type: Date,
    required: true
  },

  actualStartDate: Date,

  actualEndDate: Date,

  status: {
    type: String,
    enum: ['Scheduled', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Scheduled'
  },

  cost: {
    type: Number,
    default: 0
  },

  costDetails: String,

  mechanic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  notes: String,

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('MaintenanceSchedule', maintenanceScheduleSchema);
