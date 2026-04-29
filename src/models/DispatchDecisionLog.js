const mongoose = require('mongoose');

const componentScoreSchema = new mongoose.Schema({
  resourceId: mongoose.Schema.Types.ObjectId,
  resourceType: { type: String, enum: ['USER', 'VEHICLE'] },
  baseScore: Number, // positive value for match
  penalty: Number, // negative value for constraint violations
  tags: [String], // reason for penalty (e.g., 'tight_schedule', 'far_from_depot')
  finalScore: Number // normalized 0-1
}, { _id: false });

const dispatchDecisionLogSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },
  transactionId: {
    type: String, // Trace transaction
    required: true
  },
  algorithmVersion: {
    type: String,
    enum: ['v1_constraints_only', 'v2_heuristic_penalty'],
    default: 'v2_heuristic_penalty'
  },
  computationTimeMs: {
    type: Number,
    required: true
  },
  parameters: {
    requestedTime: Date,
    durationMs: Number,
    requiredDrivers: Number,
    requiredHelpers: Number,
    requiredVehicles: Number,
    totalWeight: Number,
    totalVolume: Number
  },
  constraintsApplied: [String], // e.g., ['cannot_arrive_on_time', 'max_weight_exceeded']
  
  // Breakdown of how we scored the viable resources
  scoreBreakdown: [componentScoreSchema],
  
  // What did we finally suggest?
  suggestedOutcome: {
    teams: [{
      driverIds: [mongoose.Schema.Types.ObjectId],
      staffIds: [mongoose.Schema.Types.ObjectId],
      vehicleIds: [mongoose.Schema.Types.ObjectId]
    }],
    alternativeTimeSlots: [Date],
    isUnderstaffedFallback: Boolean
  },
  
  // Was this forced by the user to proceed anyway?
  forceProceed: {
    type: Boolean,
    default: false
  },
  
  decisionTakenAt: {
    type: Date,
    default: Date.now
  }
});

// Used for fetching latest decisions and grouping ML training data
dispatchDecisionLogSchema.index({ invoiceId: 1, decisionTakenAt: -1 });

module.exports = mongoose.model('DispatchDecisionLog', dispatchDecisionLogSchema);