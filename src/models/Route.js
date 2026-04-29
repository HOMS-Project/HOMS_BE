const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema({
  code: { type: String, unique: true }, // VD: HCM-Q1-Q7
  name: String,
  description: String,

  /* ===== AREA ===== */
  area: {
    type: String,
    required: true
  },

  /* ===== DISTRICT MATCHING ===== */
  // NEW (recommended)
  fromDistrict: {
    type: String,
    enum: [
      "HAI_CHAU",
      "THANH_KHE",
      "SON_TRA",
      "NGU_HANH_SON",
      "LIEN_CHIEU",
      "CAM_LE"
    ]
  },
  toDistrict: {
    type: String,
    enum: [
      "HAI_CHAU",
      "THANH_KHE",
      "SON_TRA",
      "NGU_HANH_SON",
      "LIEN_CHIEU",
      "CAM_LE"
    ]
  },
  district: { // New field for street-based organization
    type: String,
    enum: [
      "HAI_CHAU",
      "THANH_KHE",
      "SON_TRA",
      "NGU_HANH_SON",
      "LIEN_CHIEU",
      "CAM_LE"
    ]
  },

  // OLD (keep for compatibility)
  // districts: [String],

  /* ===== ZONES ===== */
  startZone: String,
  endZone: String,

  /* ===== ESTIMATION ===== */
  estimatedDistanceKm: Number,
  estimatedDurationMin: Number,

  /* ===== TRAFFIC RULES =====  (GỘP giờ cấm + cao điểm) */
  trafficRules: [
    {
      ruleType: {
        type: String,
        enum: ["PEAK_HOUR", "TRUCK_BAN", "HOLIDAY", "WEATHER"]
      },

      daysOfWeek: [
        {
          type: String,
          enum: [
            "MONDAY", "TUESDAY", "WEDNESDAY",
            "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"
          ]
        }
      ],
      startTime: String,    // "06:00"
      endTime: String,      // "09:00"

      restrictedVehicles: [String],

      note: String
    }
  ],

  /* ===== VEHICLE COMPATIBILITY ===== */
  compatibleVehicles: [String], // 0.5T, 1T, 2T

  /* ===== STAFF RECOMMENDATION ===== */
  recommendedStaff: {
    min: Number,
    max: Number
  },

  /* ===== PRICE MODIFIERS ===== */
  routeSurcharge: {
    type: Number,
    default: 0
  },
  routeDiscountRate: {
    type: Number,
    default: 0
  },

  /* ===== ROAD RESTRICTIONS (Street Level) ===== */
  roadRestrictions: [
    {
      roadName: String,
      geometry: {
        type: {
          type: String,
          enum: ['LineString', 'Point'],
          default: 'LineString'
        },
        coordinates: {
          type: [[Number]] // [lng, lat]
        }
      },
      restrictionType: {
        type: String,
        enum: ['CLOSED', 'CONSTRUCTION', 'ACCIDENT', 'HEAVY_TRAFFIC', 'TRUCK_BAN', 'OTHER']
      },
      severity: {
        type: String,
        enum: ['WARN', 'AVOID'],
        default: 'WARN'
      },
      description: String,
      isActive: {
        type: Boolean,
        default: true
      }
    }
  ],

  notes: String,

  isActive: {
    type: Boolean,
    default: true
  }

}, { timestamps: true });

/* ===== INDEXES - faster query time for route ===== */
routeSchema.index({ area: 1, district: 1, name: 1 });

module.exports = mongoose.model("Route", routeSchema);
