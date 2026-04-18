const mongoose = require('mongoose');

// Because we don't have Redis fully integrated, we create a Materialized View using a Mongoose schema.
// This view holds a fast-read snapshot of `nextAvailableTime` and `workloadCount` 
// and will be updated asynchronously or during the dispatch transaction.

const resourceScheduleViewSchema = new mongoose.Schema({
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  resourceType: {
    type: String, // 'USER' or 'VEHICLE'
    required: true,
    index: true
  },
  date: {
    type: Date, // We can partition by date if workloadCount is per day. But let's just make it a general schedule view for now.
    required: true,
    index: true
  },
  // The workload taken on this specific date (to calculate fairness)
  workloadCount: {
    type: Number,
    default: 0
  },
  // The exact end time of their last job on this date so they can't be scheduled again before this time.
  nextAvailableTime: {
    type: Date,
    default: null
  },
  
  // Basic info for fast retrieval
  currentLocation: {
    lat: Number,
    lng: Number,
    lastUpdated: Date
  }
}, { timestamps: true });

// Ensure one view per resource per day
resourceScheduleViewSchema.index({ resourceId: 1, date: 1 }, { unique: true });

// Compound index for querying available resources quickly without `find` and `$elemMatch` overlapping queries.
// Example: find { resourceType: 'USER', date: today, nextAvailableTime: { $lte: requestedTime } } 
// and sort by { workloadCount: 1 } for fairness scoring
resourceScheduleViewSchema.index({ resourceType: 1, date: 1, nextAvailableTime: 1, workloadCount: 1 });

module.exports = mongoose.model('ResourceScheduleView', resourceScheduleViewSchema);