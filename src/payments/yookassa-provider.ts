import { PaymentProvider, CreatePaymentInput, PaymentCreationResult, PaymentStatusResult, WebhookProcessResult, RefundResult } from './types.ts';
import { AppError } from '../core/errors.ts';
import crypto from 'node:crypto';

export class YooKassaPaymentProvider implements PaymentProvider {
  public readonly name = 'yookassa';
  private shopId: string;
  private secretKey: string;

  constructor() {
    this.shopId = process.env.PAYMENT_API_KEY || '';
    this.secretKey = process.env.PAYMENT_SECRET || '';
  }

  public async createPayment(input: CreatePaymentInput): Promise<PaymentCreationResult> {
    if (!this.shopId || !this.secretKey) {
      throw new AppError('YooKassa credentials missing in environment (PAYMENT_API_KEY and PAYMENT_SECRET).', 500);
    }

    const idempotencyKey = crypto.randomUUID();
    const authHeader = 'Basic ' + Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64');

    const body = {
      amount: {
        value: input.amount.toFixed(2),
        currency: input.currency === 'RUB' ? 'RUB' : input.currency,
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: input.returnUrl,
      },
      description: input.description,
      metadata: {
        orderId: input.orderId,
        orderNumber: input.orderNumber,
      },
    };

    try {
      const res = await fetch('https://api.yookassa.ru/v3/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'Idempotence-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new AppError(`YooKassa API Error: ${res.statusText}`, res.status, JSON.stringify(errorData));
      }

      const data = await res.json();
      return {
        provider: this.name,
        providerPaymentId: data.id,
        paymentUrl: data.confirmation?.confirmation_url || input.returnUrl,
        status: data.status === 'succeeded' ? 'PAID' : 'PENDING',
        isTestMode: false,
      };
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Failed to create YooKassa payment: ${err.message}`, 502);
    }
  }

  public async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    const authHeader = 'Basic ' + Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64');
    const res = await fetch(`https://api.yookassa.ru/v3/payments/${providerPaymentId}`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) throw new AppError(`YooKassa fetch failed: ${res.statusText}`, res.status);
    const data = await res.json();
    return {
      providerPaymentId: data.id,
      status: data.status === 'succeeded' ? 'PAID' : 'PENDING',
      amount: parseFloat(data.amount.value),
      currency: data.amount.currency,
      paidAt: data.captured_at,
    };
  }

  public async handleWebhook(payload: any): Promise<WebhookProcessResult> {
    const event = payload?.event;
    const object = payload?.object;

    if (!object || !object.id) {
      throw new AppError('Invalid YooKassa webhook payload', 400);
    }

    const orderId = object.metadata?.orderId;
    if (!orderId) {
      throw new AppError('Missing orderId in YooKassa webhook metadata', 400);
    }

    return {
      provider: this.name,
      providerPaymentId: object.id,
      orderId,
      idempotencyKey: payload.id || `yk_${object.id}_${event}`,
      status: object.status === 'succeeded' ? 'PAID' : 'PENDING',
      amount: parseFloat(object.amount?.value || '0'),
      currency: object.amount?.currency || 'RUB',
      eventType: event || 'payment.succeeded',
      rawPayload: payload,
    };
  }

  public async refundPayment(providerPaymentId: string, amount?: number): Promise<RefundResult> {
    const idempotencyKey = crypto.randomUUID();
    const authHeader = 'Basic ' + Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64');
    const body: any = { payment_id: providerPaymentId };
    if (amount) body.amount = { value: amount.toFixed(2), currency: 'RUB' };

    const res = await fetch('https://api.yookassa.ru/v3/refunds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'Idempotence-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new AppError('YooKassa refund failed', res.status);
    const data = await res.json();
    return {
      success: data.status === 'succeeded',
      refundId: data.id,
      status: data.status === 'succeeded' ? 'SUCCEEDED' : 'PENDING',
      amount: parseFloat(data.amount?.value || '0'),
    };
  }
}
