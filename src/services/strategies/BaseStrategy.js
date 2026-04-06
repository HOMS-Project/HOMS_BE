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
   * Called to handle post-creation steps (like SurveyData generation).
   */
  async handlePostCreation(ticket, data) {
    // Default implementation does nothing. Override in subclasses.
  }

  /**
   * Called to handle the approval flow and assignment.
   */
  async handleApproval(ticket, approverId, additionalData, io) {
    throw new Error('Method not implemented.');
  }

  /**
   * Defines any specific status handling logic (e.g. creating invoices, triggering webhooks).
   */
  async handleStatusUpdate(ticket, newStatus, userId) {
    const TicketStateMachine = require('../../TicketStateMachine');
    await TicketStateMachine.transition(ticket, newStatus, { userId });
    return ticket;
  }
}

module.exports = BaseStrategy;
