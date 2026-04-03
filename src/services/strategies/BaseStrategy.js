/**
 * BaseStrategy
 * The interface/base class for all Request Ticket strategies.
 */
class BaseStrategy {
  /**
   * Validate the creation payload.
   * Throws an error if invalid.
   */
  validateCreate(data) {
    throw new Error('Method not implemented.');
  }

  /**
   * Get the allowed transitions for a given status.
   * Returns an array of valid statuses.
   */
  getAllowedTransitions(currentStatus) {
    throw new Error('Method not implemented.');
  }

  /**
   * Defines any specific status handling logic (e.g. creating invoices, triggering webhooks).
   */
  async handleStatusUpdate(ticket, newStatus, userId) {
    ticket.status = newStatus;
    await ticket.save();
    return ticket;
  }
}

module.exports = BaseStrategy;
