import { PaymentProvider, CreatePaymentInput, PaymentCreationResult, PaymentStatusResult, WebhookProcessResult, RefundResult } from './types.ts';
import { AppError } from '../core/errors.ts';
import crypto from 'node:crypto';

export class MockPaymentProvider implements PaymentProvider {
  public readonly name = 'mock';

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';
    const allowMock = process.env.ALLOW_MOCK_PAYMENTS === 'true';
    if (isProd && !allowMock) {
      throw new AppError('MockPaymentProvider cannot be initialized in production environment.', 500, 'SECURITY_VIOLATION');
    }
  }

  public async createPayment(input: CreatePaymentInput): Promise<PaymentCreationResult> {
    const providerPaymentId = `mock_pay_${crypto.randomUUID().slice(0, 8)}`;
    const paymentUrl = `/payment/mock?id=${providerPaymentId}&orderId=${input.orderId}&amount=${input.amount}&currency=${input.currency}`;

    return {
      provider: this.name,
      providerPaymentId,
      paymentUrl,
      status: 'PENDING',
      isTestMode: true,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  public async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    return {
      providerPaymentId,
      status: 'PAID',
      amount: 0,
      currency: 'RUB',
      paidAt: new Date().toISOString(),
    };
  }

  public async handleWebhook(payload: any): Promise<WebhookProcessResult> {
    if (!payload || !payload.providerPaymentId || !payload.orderId) {
      throw new AppError('Invalid mock payment webhook payload', 400);
    }

    const idempotencyKey = payload.idempotencyKey || `mock_evt_${payload.providerPaymentId}_${payload.status || 'PAID'}`;

    return {
      provider: this.name,
      providerPaymentId: payload.providerPaymentId,
      orderId: payload.orderId,
      idempotencyKey,
      status: payload.status || 'PAID',
      amount: Number(payload.amount) || 0,
      currency: payload.currency || 'RUB',
      eventType: payload.eventType || 'payment.succeeded',
      rawPayload: payload,
    };
  }

  public async refundPayment(providerPaymentId: string, amount?: number): Promise<RefundResult> {
    return {
      success: true,
      refundId: `mock_ref_${crypto.randomUUID().slice(0, 8)}`,
      status: 'SUCCEEDED',
      amount: amount || 0,
    };
  }
}
