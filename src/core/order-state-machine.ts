import { OrderStatus } from './types.ts';
import { InvalidStateTransitionError } from './errors.ts';

/**
 * Order State Machine
 * Enforces valid state transitions and protects against impossible statuses.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'REFUNDED'],
  PROCESSING: ['READY', 'REFUNDED', 'CANCELLED'],
  READY: ['COMPLETED', 'REFUNDED', 'CANCELLED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export class OrderStateMachine {
  /**
   * Check if transition is allowed
   */
  public static canTransition(from: OrderStatus, to: OrderStatus): boolean {
    if (from === to) return true;
    const allowed = ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Assert transition is valid or throw InvalidStateTransitionError
   */
  public static validateTransition(from: OrderStatus, to: OrderStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }

  /**
   * Returns list of reachable states from current state
   */
  public static getAllowedNextStates(current: OrderStatus): OrderStatus[] {
    return ALLOWED_TRANSITIONS[current] || [];
  }
}
