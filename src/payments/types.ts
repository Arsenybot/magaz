import { PaymentStatus } from '../core/types.ts';

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string;
  customerPhone?: string;
  returnUrl: string;
  metadata?: Record<string, string>;
}

export interface PaymentCreationResult {
  provider: string;
  providerPaymentId: string;
  paymentUrl: string;
  status: PaymentStatus;
  expiresAt?: string;
  isTestMode: boolean;
}

export interface PaymentStatusResult {
  providerPaymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paidAt?: string;
}

export interface WebhookProcessResult {
  provider: string;
  providerPaymentId: string;
  orderId: string;
  idempotencyKey: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  eventType: string;
  rawPayload: any;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  amount: number;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<PaymentCreationResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>;
  handleWebhook(payload: any, headers?: Record<string, string | string[] | undefined>): Promise<WebhookProcessResult>;
  refundPayment(providerPaymentId: string, amount?: number): Promise<RefundResult>;
}
