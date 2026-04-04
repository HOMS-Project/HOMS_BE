/**
 * AutoAssignmentService
 *
 * Assigns a district dispatcher to review a ticket (SPECIFIC_ITEMS / TRUCK_RENTAL)
 * after the Head Dispatcher approves it. Uses cascading load-balanced district matching.
 *
 * Cascading strategy:
 *  1. Dispatcher with workingAreas matching pickup.district + load < SOFT_LIMIT
 *  2. Any available dispatcher + load < SOFT_LIMIT (global fallback)
 *  3. Least-loaded dispatcher + load < HARD_LIMIT
 *  4. All exceed HARD_LIMIT → return null (ticket set to ASSIGNMENT_FAILED)
 *
 * "Active load" = tickets in review/survey pipeline:
 *   WAITING_REVIEW | WAITING_SURVEY | SURVEYED | QUOTED
 */

const User = require('../models/User');
const RequestTicket = require('../models/RequestTicket');
const GeocodeService = require('./geocodeService');

const SOFT_LIMIT = 5;
const HARD_LIMIT = 10;

// Statuses that count toward a dispatcher's current workload
const ACTIVE_STATUSES = ['WAITING_REVIEW', 'WAITING_SURVEY', 'SURVEYED', 'QUOTED'];

class AutoAssignmentService {
  /**
   * Count the number of active tickets assigned to a specific dispatcher.
   */
  async getDispatcherLoad(dispatcherId) {
    return RequestTicket.countDocuments({
      dispatcherId,
      status: { $in: ACTIVE_STATUSES }
    });
  }

  /**
   * Build a pool of all available dispatchers with their current load.
   * Returns: [{ dispatcher, load }] sorted by load ascending.
   */
  async buildLoadMap() {
    const dispatchers = await User.find({
      role: 'dispatcher',
      'dispatcherProfile.isAvailable': true
    }).select('_id fullName dispatcherProfile');

    const loadEntries = await Promise.all(
      dispatchers.map(async (d) => ({
        dispatcher: d,
        load: await this.getDispatcherLoad(d._id),
      }))
    );

    return loadEntries.sort((a, b) => a.load - b.load);
  }

  /**
   * Main entry point: find and assign a district dispatcher to review the ticket.
   * @param {Object} ticket - RequestTicket document (needs pickup.district)
   * @returns {ObjectId|null} dispatcherId if found; null if all over HARD_LIMIT
   */
  async assignDispatcher(ticket) {
    const pickupDistrict = ticket.pickup?.district;
    const normalizedDistrict = pickupDistrict
      ? GeocodeService.normalizeDistrict(pickupDistrict)
      : null;

    const loadMap = await this.buildLoadMap();

    // ── Step 1: District match + load < SOFT_LIMIT ─────────────────────────
    if (normalizedDistrict) {
      const districtMatch = loadMap.find(({ dispatcher, load }) => {
        const areas = (dispatcher.dispatcherProfile?.workingAreas || []).map(
          (a) => GeocodeService.normalizeDistrict(a) || a
        );
        return areas.includes(normalizedDistrict) && load < SOFT_LIMIT;
      });

      if (districtMatch) {
        console.log(
          `[AutoAssign] Step 1 — district match: ${districtMatch.dispatcher.fullName} (load=${districtMatch.load})`
        );
        return districtMatch.dispatcher._id;
      }
    }

    // ── Step 2: Any dispatcher with load < SOFT_LIMIT ──────────────────────
    const softAvailable = loadMap.find(({ load }) => load < SOFT_LIMIT);
    if (softAvailable) {
      console.log(
        `[AutoAssign] Step 2 — global soft fallback: ${softAvailable.dispatcher.fullName} (load=${softAvailable.load})`
      );
      return softAvailable.dispatcher._id;
    }

    // ── Step 3: Least-loaded dispatcher with load < HARD_LIMIT ────────────
    const hardAvailable = loadMap.find(({ load }) => load < HARD_LIMIT);
    if (hardAvailable) {
      console.log(
        `[AutoAssign] Step 3 — hard limit fallback: ${hardAvailable.dispatcher.fullName} (load=${hardAvailable.load})`
      );
      return hardAvailable.dispatcher._id;
    }

    // ── Step 4: All dispatchers exceed HARD_LIMIT ──────────────────────────
    console.warn('[AutoAssign] Step 4 — all dispatchers over HARD_LIMIT. Escalating to Head Dispatcher.');
    return null;
  }
}

module.exports = new AutoAssignmentService();
