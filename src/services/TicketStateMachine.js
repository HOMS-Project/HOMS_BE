const mongoose = require('mongoose');
const AppError = require('../utils/appErrors');

class TicketStateMachine {
  /**
   * Centralized method to safely transition a RequestTicket status.
   * Ensures the transition is valid according to the ticket's Strategy,
   * applies any necessary data payloads safely, and supports transactions.
   *
   * @param {Object} ticket - The RequestTicket document
   * @param {String} newStatus - The target status
   * @param {Object} context - Optional context { userId, payload, session }
   */
  async transition(ticket, newStatus, context = {}) {
    const { userId, payload = {}, session } = context;
    const currentStatus = ticket.status;

    // Fix circular dependency by requiring inside method block
    const StrategyFactory = require('./strategies/StrategyFactory');

    // 1. Validate the transition using the specific strategy
    const strategy = StrategyFactory.getStrategy(ticket.moveType);
    const allowedTransitions = strategy.getAllowedTransitions(currentStatus);

    if (!allowedTransitions.includes(newStatus)) {
      throw new AppError(
        `Chuyển đổi trạng thái không hợp lệ. Không thể chuyển từ ${currentStatus} sang ${newStatus} cho dịch vụ ${ticket.moveType}.`,
        400
      );
    }

    // 2. Apply Domain-Specific Side Effects & Payload Mapping
    switch (newStatus) {
      case 'QUOTED':
        // When transitioning to QUOTED, we MUST attach the pricing data safely
        if (!payload.pricing) {
          throw new AppError('Chuyển sang trạng thái QUOTED bắt buộc phải có dữ liệu báo giá (pricing payload).', 400);
        }
        ticket.pricing = {
          pricingDataId: payload.pricing._id,
          subtotal: payload.pricing.subtotal,
          tax: payload.pricing.tax,
          totalPrice: payload.pricing.totalPrice,
          version: payload.pricing.version,
          quotedAt: new Date(),
          isFinalized: false
        };
        break;

      case 'WAITING_SURVEY':
        // Full House: Surveyor is assigned, or survey is accepted
        if (payload.dispatcherId) {
          ticket.dispatcherId = payload.dispatcherId;
        }
        if (payload.scheduledTime) {
          ticket.scheduledTime = payload.scheduledTime;
        }
        break;

      case 'ACCEPTED':
        // Customer accepts the quote
        if (!ticket.pricing?.pricingDataId) {
          throw new AppError('Ticket chưa có báo giá, không thể ACCEPTED.', 400);
        }
        ticket.pricing.acceptedAt = new Date();
        break;

      case 'CANCELLED':
        // Cancellation must have a reason
        if (payload.notes || payload.reason) {
          ticket.notes = payload.notes || payload.reason;
        }
        break;
        
      case 'CONVERTED':
        // Converted to Contract/Invoice
        break;
        
      case 'WAITING_REVIEW':
      case 'ASSIGNMENT_FAILED':
        break;

      default:
        // Let the strategy handle any deeply specific status updates if it needs to
        if (typeof strategy.handleStatusUpdate === 'function') {
          await strategy.handleStatusUpdate(ticket, newStatus, userId);
        }
        break;
    }

    // 3. Update the exact status lock
    ticket.status = newStatus;

    // 4. Save Safely (with or without a MongoDB Transaction Session)
    if (session) {
      await ticket.save({ session });
    } else {
      await ticket.save();
    }

    return ticket;
  }
}

module.exports = new TicketStateMachine();
