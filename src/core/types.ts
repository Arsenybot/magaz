/**
 * Core Domain Models & Types
 */

export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED';

export type OrderStatus =
  | 'NEW'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'PROCESSING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type DeliveryMethod = 'DELIVERY' | 'PICKUP';

export type UserRole = 'CUSTOMER' | 'ADMIN';

export interface User {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string; // e.g. "Size S", "Black / M"
  size: string; // S, M, L, XL, etc.
  sku: string;
  priceOverride?: number | null;
  stockQuantity: number;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number; // Base price
  currency: string;
  categoryId: string;
  categoryName?: string;
  images: string[];
  status: ProductStatus;
  variants?: ProductVariant[];
  totalStock?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  variantId: string;
  quantity: number;
  // Hydrated details
  product?: Product;
  variant?: ProductVariant;
  unitPrice: number;
  totalPrice: number;
  isAvailable: boolean;
  availableStock: number;
}

export interface Cart {
  id: string;
  userId: string;
  items: CartItem[];
  subtotal: number;
  itemsCount: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentProvider: string;
  paymentId?: string | null;
  subtotal: number;
  deliveryPrice: number;
  total: number;
  currency: string;
  customerName: string;
  customerPhone: string;
  customerUsername?: string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: string;
  comment?: string;
  items?: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettings {
  storeName: string;
  description: string;
  logo: string;
  currency: string;
  contactTelegram: string;
  contactPhone: string;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  paymentEnabled: boolean;
  deliveryPrice: number;
  freeDeliveryThreshold: number;
}

export interface PaymentEvent {
  id: string;
  orderId: string;
  provider: string;
  providerPaymentId: string;
  idempotencyKey: string;
  eventType: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  rawPayload: string;
  createdAt: string;
}
