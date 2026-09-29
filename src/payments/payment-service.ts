import { PaymentProvider, CreatePaymentInput, PaymentCreationResult, WebhookProcessResult } from './types.ts';
import { MockPaymentProvider } from './mock-provider.ts';
import { YooKassaPaymentProvider } from './yookassa-provider.ts';
import { TelegramPaymentProvider } from './telegram-provider.ts';
import { getDatabase } from '../database/db.ts';
import { AppError, NotFoundError } from '../core/errors.ts';
import { OrderStateMachine } from '../core/order-state-machine.ts';
import { OrderStatus, PaymentStatus } from '../core/types.ts';
import crypto from 'node:crypto';

export class PaymentService {
  private providers: Map<string, PaymentProvider> = new Map();
  private defaultProviderName: string;
  private notificationService?: any;

  constructor(notificationService?: any) {
    this.notificationService = notificationService;
    
    // Register available providers
    try {
      this.providers.set('mock', new MockPaymentProvider());
    } catch {
      // Prod without mock flag
    }
    this.providers.set('yookassa', new YooKassaPaymentProvider());
    this.providers.set('telegram', new TelegramPaymentProvider());

    this.defaultProviderName = process.env.PAYMENT_PROVIDER || 'mock';
  }

  public setNotificationService(service: any): void {
    this.notificationService = service;
  }

  public getProvider(name?: string): PaymentProvider {
    const providerName = name || this.defaultProviderName;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new AppError(`Payment provider "${providerName}" is not available or not configured.`, 400);
    }
    return provider;
  }

  /**
   * Initialize a payment for an order
   */
  public async createPayment(orderId: string, customReturnUrl?: string): Promise<PaymentCreationResult> {
    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    if (order.payment_status === 'PAID') {
      throw new AppError('Заказ уже оплачен.', 400);
    }

    const provider = this.getProvider(order.payment_provider || this.defaultProviderName);
    const returnUrl = customReturnUrl || `${process.env.APP_URL || ''}/order/${order.id}?status=check`;

    const input: CreatePaymentInput = {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total,
      currency: order.currency,
      description: `Оплата заказа #${order.order_number} в магазине одежды`,
      customerPhone: order.customer_phone,
      returnUrl,
    };

    const result = await provider.createPayment(input);

    const now = new Date().toISOString();
    const paymentRecordId = `pay_${crypto.randomUUID().slice(0, 8)}`;

    // Record payment attempt
    db.prepare(`
      INSERT INTO payments (id, order_id, provider, provider_payment_id, amount, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentRecordId,
      order.id,
      result.provider,
      result.providerPaymentId,
      order.total,
      order.currency,
      result.status,
      now,
      now
    );

    // Update order with payment ID and transition status to PAYMENT_PENDING if NEW
    if (order.status === 'NEW') {
      OrderStateMachine.validateTransition(order.status as OrderStatus, 'PAYMENT_PENDING');
      db.prepare(`
        UPDATE orders SET status = 'PAYMENT_PENDING', payment_id = ?, updated_at = ? WHERE id = ?
      `).run(result.providerPaymentId, now, order.id);
    } else {
      db.prepare(`
        UPDATE orders SET payment_id = ?, updated_at = ? WHERE id = ?
      `).run(result.providerPaymentId, now, order.id);
    }

    return result;
  }

  /**
   * Process incoming webhook idempotently
   */
  public async processWebhook(
    providerName: string,
    payload: any,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<{ handled: boolean; isDuplicate: boolean; orderId?: string; status?: PaymentStatus }> {
    const provider = this.getProvider(providerName);
    const webhookResult: WebhookProcessResult = await provider.handleWebhook(payload, headers);

    const db = getDatabase();

    // IDEMPOTENCY CHECK
    const existingEvent = db.prepare(`
      SELECT * FROM payment_events WHERE idempotency_key = ?
    `).get(webhookResult.idempotencyKey) as any;

    if (existingEvent) {
      // Event has already been processed! Return existing state safely without side-effects.
      return {
        handled: true,
        isDuplicate: true,
        orderId: webhookResult.orderId,
        status: existingEvent.status as PaymentStatus,
      };
    }

    // Begin atomic update
    const now = new Date().toISOString();
    const eventId = `pe_${crypto.randomUUID().slice(0, 8)}`;

    db.exec('BEGIN IMMEDIATE;');
    try {
      // 1. Record payment event
      db.prepare(`
        INSERT INTO payment_events (
          id, order_id, provider, provider_payment_id, idempotency_key, event_type, status, amount, currency, raw_payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId,
        webhookResult.orderId,
        webhookResult.provider,
        webhookResult.providerPaymentId,
        webhookResult.idempotencyKey,
        webhookResult.eventType,
        webhookResult.status,
        webhookResult.amount,
        webhookResult.currency,
        JSON.stringify(webhookResult.rawPayload),
        now
      );

      // 2. Fetch order
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(webhookResult.orderId) as any;
      if (!order) {
        db.exec('ROLLBACK;');
        throw new NotFoundError('Order', webhookResult.orderId);
      }

      // 3. Update payment status in payments table
      db.prepare(`
        UPDATE payments SET status = ?, updated_at = ? WHERE provider_payment_id = ? OR order_id = ?
      `).run(webhookResult.status, now, webhookResult.providerPaymentId, webhookResult.orderId);

      // 4. If status is PAID, update order status
      if (webhookResult.status === 'PAID' && order.payment_status !== 'PAID') {
        const nextOrderStatus: OrderStatus = 'PAID';
        if (order.status !== 'PAID') {
          OrderStateMachine.validateTransition(order.status as OrderStatus, nextOrderStatus);
        }

        db.prepare(`
          UPDATE orders SET
            status = 'PAID',
            payment_status = 'PAID',
            payment_id = ?,
            updated_at = ?
          WHERE id = ?
        `).run(webhookResult.providerPaymentId, now, order.id);
      } else if (webhookResult.status === 'FAILED' && order.payment_status !== 'PAID') {
        db.prepare(`
          UPDATE orders SET payment_status = 'FAILED', updated_at = ? WHERE id = ?
        `).run(now, order.id);
      }

      db.exec('COMMIT;');

      // 5. Notify customer and admin after successful transaction commit
      if (webhookResult.status === 'PAID' && order.payment_status !== 'PAID' && this.notificationService) {
        const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) as any;
        this.notificationService.notifyCustomerOrderPaid(updatedOrder).catch(console.error);
        this.notificationService.notifyAdminOrderPaid(updatedOrder).catch(console.error);
      }

      return {
        handled: true,
        isDuplicate: false,
        orderId: webhookResult.orderId,
        status: webhookResult.status,
      };
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // ignore
      }
      throw err;
    }
  }
}
