class FeasibilityEngine {
  static estimateDuration(baseHours, idealStaff, actualStaff) {
    const missing = Math.max(0, idealStaff - actualStaff);
    const adjustedHours = baseHours + (1.3 * missing);
    return Math.round(adjustedHours * 60);
  }

  static checkSafety(actualStaff, idealStaff, durationMinutes) {
    return {
      isSafetyBlock: (actualStaff < 2 && idealStaff > 1),
      durationExceeded: durationMinutes > 720
    };
  }

  static evaluateStaffing(actualStaff, idealStaff) {
    const ratio = actualStaff / idealStaff;

    // CRITICAL if staff < 75% of ideal
    if (ratio < 0.75) return { level: 'CRITICAL', ratio };
    // WARNING if 75% < staff < 100% of ideal
    if (ratio < 1.0) return { level: 'WARNING', ratio };
    // SAFE if staff >= 100% of ideal
    return { level: 'SAFE', ratio };
  }

  static async detectConflicts(dispatchService, resourceIds, startTime, duration) {
    return dispatchService.detectDownstreamConflicts(resourceIds, startTime, duration);
  }
}

module.exports = FeasibilityEngine;