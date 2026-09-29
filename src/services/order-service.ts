import { getDatabase } from '../database/db.ts';
import { Order, OrderItem, OrderStatus, DeliveryMethod, User } from '../core/types.ts';
import { AppError, NotFoundError, ForbiddenError, InsufficientStockError, ValidationError } from '../core/errors.ts';
import { OrderStateMachine } from '../core/order-state-machine.ts';
import { CartService } from './cart-service.ts';
import { NotificationService } from '../telegram/notification-service.ts';
import crypto from 'node:crypto';

export interface CreateOrderInput {
  userId: string;
  customerName: string;
  customerPhone: string;
  customerUsername?: string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: string;
  comment?: string;
  paymentProvider?: string;
}

export class OrderService {
  private cartService: CartService;
  private notificationService: NotificationService;

  constructor(cartService: CartService, notificationService: NotificationService) {
    this.cartService = cartService;
    this.notificationService = notificationService;
  }

  /**
   * Create an order from current user's cart
   */
  public async createOrder(input: CreateOrderInput): Promise<Order> {
    if (!input.customerName || !input.customerName.trim()) {
      throw new ValidationError('Имя покупателя обязательно для оформления заказа');
    }
    if (!input.customerPhone || !input.customerPhone.trim()) {
      throw new ValidationError('Номер телефона обязателен для связи');
    }
    if (input.deliveryMethod === 'DELIVERY' && (!input.deliveryAddress || !input.deliveryAddress.trim())) {
      throw new ValidationError('Укажите адрес доставки');
    }

    const db = getDatabase();

    // Fetch store settings for delivery rules
    const settings = db.prepare('SELECT * FROM store_settings LIMIT 1').get() as any;
    const baseDeliveryPrice = settings?.delivery_price ?? 350;
    const freeDeliveryThreshold = settings?.free_delivery_threshold ?? 5000;
    const currency = settings?.currency || 'RUB';

    // Fetch active cart items directly from DB to prevent race condition
    const cart = this.cartService.getOrCreateCart(input.userId);
    if (!cart.items || cart.items.length === 0) {
      throw new AppError('Корзина пуста. Добавьте товары перед оформлением заказа.', 400);
    }

    const orderId = `ord_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // Generate readable order number (e.g. 1001, 1002, ...)
    const lastOrder = db.prepare('SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 1').get() as any;
    const nextNum = lastOrder && !isNaN(Number(lastOrder.order_number)) ? Number(lastOrder.order_number) + 1 : 1001;
    const orderNumber = String(nextNum);

    db.exec('BEGIN IMMEDIATE;');
    try {
      let subtotal = 0;
      const orderItemsToInsert: {
        id: string;
        orderId: string;
        productId: string;
        variantId: string;
        productNameSnapshot: string;
        variantNameSnapshot: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }[] = [];

      // Validate every cart item atomically against current DB stock
      for (const item of cart.items) {
        const variant = db.prepare(`
          SELECT pv.*, p.name as product_name, p.price as base_product_price, p.status as product_status
          FROM product_variants pv
          JOIN products p ON pv.product_id = p.id
          WHERE pv.id = ?
        `).get(item.variantId) as any;

        if (!variant || variant.product_status !== 'ACTIVE' || variant.status !== 'ACTIVE') {
          throw new AppError(`Товар "${item.product?.name || item.productId}" больше не доступен`, 400);
        }

        if (variant.stock_quantity < item.quantity) {
          throw new InsufficientStockError(variant.product_name, item.quantity, variant.stock_quantity);
        }

        const unitPrice = variant.price_override !== null && variant.price_override !== undefined
          ? variant.price_override
          : variant.base_product_price;

        const itemTotal = unitPrice * item.quantity;
        subtotal += itemTotal;

        // Atomically reserve/decrement stock
        db.prepare(`
          UPDATE product_variants
          SET stock_quantity = stock_quantity - ?
          WHERE id = ? AND stock_quantity >= ?
        `).run(item.quantity, variant.id, item.quantity);

        orderItemsToInsert.push({
          id: `oi_${crypto.randomUUID().slice(0, 8)}`,
          orderId,
          productId: variant.product_id,
          variantId: variant.id,
          productNameSnapshot: variant.product_name,
          variantNameSnapshot: variant.name,
          quantity: item.quantity,
          unitPrice,
          totalPrice: itemTotal,
        });
      }

      // Calculate delivery
      let deliveryPrice = 0;
      if (input.deliveryMethod === 'DELIVERY') {
        deliveryPrice = subtotal >= freeDeliveryThreshold ? 0 : baseDeliveryPrice;
      }
      const total = subtotal + deliveryPrice;

      // Insert Order record
      db.prepare(`
        INSERT INTO orders (
          id, order_number, user_id, status, payment_status, payment_provider,
          subtotal, delivery_price, total, currency,
          customer_name, customer_phone, customer_username,
          delivery_method, delivery_address, comment,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        orderNumber,
        input.userId,
        'NEW',
        'PENDING',
        input.paymentProvider || 'mock',
        subtotal,
        deliveryPrice,
        total,
        currency,
        input.customerName.trim(),
        input.customerPhone.trim(),
        input.customerUsername?.replace('@', '').trim() || null,
        input.deliveryMethod,
        input.deliveryAddress?.trim() || null,
        input.comment?.trim() || null,
        now,
        now
      );

      // Insert OrderItems snapshots
      const insertItemStmt = db.prepare(`
        INSERT INTO order_items (
          id, order_id, product_id, variant_id, product_name_snapshot, variant_name_snapshot,
          quantity, unit_price, total_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const oi of orderItemsToInsert) {
        insertItemStmt.run(
          oi.id,
          oi.orderId,
          oi.productId,
          oi.variantId,
          oi.productNameSnapshot,
          oi.variantNameSnapshot,
          oi.quantity,
          oi.unitPrice,
          oi.totalPrice
        );
      }

      // Clear user's cart
      db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);

      db.exec('COMMIT;');

      const createdOrder = this.getOrderById(orderId);

      // Notify administrator of new order
      this.notificationService.notifyAdminNewOrder(createdOrder).catch(console.error);

      return createdOrder;
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Get order by ID with authorization check
   */
  public getOrderById(orderId: string, requestingUser?: User): Order {
    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    // Role-based authorization: regular customers can only view their own orders
    if (requestingUser && requestingUser.role !== 'ADMIN' && order.user_id !== requestingUser.id) {
      throw new ForbiddenError('У вас нет доступа к просмотру этого заказа.');
    }

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) as any[];

    return {
      id: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      status: order.status as OrderStatus,
      paymentStatus: order.payment_status,
      paymentProvider: order.payment_provider,
      paymentId: order.payment_id,
      subtotal: order.subtotal,
      deliveryPrice: order.delivery_price,
      total: order.total,
      currency: order.currency,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      customerUsername: order.customer_username,
      deliveryMethod: order.delivery_method,
      deliveryAddress: order.delivery_address,
      comment: order.comment,
      items: items.map((i) => ({
        id: i.id,
        orderId: i.order_id,
        productId: i.product_id,
        variantId: i.variant_id,
        productNameSnapshot: i.product_name_snapshot,
        variantNameSnapshot: i.variant_name_snapshot,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        totalPrice: i.total_price,
      })),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  /**
   * Get orders for specific user
   */
  public getUserOrders(userId: string): Order[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
    return rows.map((r) => this.getOrderById(r.id));
  }

  /**
   * Update order status with state machine enforcement and stock rollback if CANCELLED
   */
  public async updateOrderStatus(orderId: string, newStatus: OrderStatus, adminUser: User): Promise<Order> {
    if (adminUser.role !== 'ADMIN') {
      throw new ForbiddenError('Только администратор может изменять статус заказа.');
    }

    const db = getDatabase();
    const order = this.getOrderById(orderId);
    const oldStatus = order.status;

    // Validate state machine transition
    OrderStateMachine.validateTransition(oldStatus, newStatus);

    const now = new Date().toISOString();

    db.exec('BEGIN IMMEDIATE;');
    try {
      // If transitioning to CANCELLED, release reserved stock back into database
      if (newStatus === 'CANCELLED' && oldStatus !== 'CANCELLED') {
        const items = db.prepare('SELECT variant_id, quantity FROM order_items WHERE order_id = ?').all(orderId) as any[];
        for (const item of items) {
          db.prepare(`
            UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?
          `).run(item.quantity, item.variant_id);
        }
      }

      db.prepare(`
        UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
      `).run(newStatus, now, orderId);

      db.exec('COMMIT;');

      const updated = this.getOrderById(orderId);

      // Notify customer of status change
      this.notificationService.notifyCustomerStatusChange(updated, oldStatus, newStatus).catch(console.error);

      return updated;
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }
}
