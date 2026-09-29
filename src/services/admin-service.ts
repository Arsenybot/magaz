import { getDatabase } from '../database/db.ts';
import { StoreSettings, Order } from '../core/types.ts';
import { NotFoundError } from '../core/errors.ts';

export class AdminService {
  /**
   * Dashboard key performance indicators
   */
  public getDashboardStats(): {
    totalRevenue: number;
    totalOrders: number;
    paidOrders: number;
    pendingOrders: number;
    completedOrders: number;
    totalCustomers: number;
    lowStockVariants: any[];
    recentOrders: Order[];
  } {
    const db = getDatabase();

    const revenueRow = db.prepare(`
      SELECT SUM(total) as revenue FROM orders WHERE payment_status = 'PAID'
    `).get() as any;

    const ordersCountRow = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN payment_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
      FROM orders
    `).get() as any;

    const customersCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE role = 'CUSTOMER'
    `).get() as any;

    const lowStockVariants = db.prepare(`
      SELECT pv.*, p.name as product_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.stock_quantity < 5 AND pv.status = 'ACTIVE'
      ORDER BY pv.stock_quantity ASC
      LIMIT 10
    `).all() as any[];

    const recentOrderRows = db.prepare(`
      SELECT * FROM orders ORDER BY created_at DESC LIMIT 5
    `).all() as any[];

    return {
      totalRevenue: revenueRow?.revenue || 0,
      totalOrders: ordersCountRow?.total || 0,
      paidOrders: ordersCountRow?.paid || 0,
      pendingOrders: ordersCountRow?.pending || 0,
      completedOrders: ordersCountRow?.completed || 0,
      totalCustomers: customersCountRow?.count || 0,
      lowStockVariants,
      recentOrders: recentOrderRows.map((o) => ({
        id: o.id,
        orderNumber: o.order_number,
        userId: o.user_id,
        status: o.status,
        paymentStatus: o.payment_status,
        paymentProvider: o.payment_provider,
        subtotal: o.subtotal,
        deliveryPrice: o.delivery_price,
        total: o.total,
        currency: o.currency,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        customerUsername: o.customer_username,
        deliveryMethod: o.delivery_method,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
    };
  }

  /**
   * Get store settings
   */
  public getStoreSettings(): StoreSettings {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM store_settings LIMIT 1').get() as any;
    if (!row) {
      return {
        storeName: 'ATELIER',
        description: 'Премиальный базовый гардероб',
        logo: '',
        currency: 'RUB',
        contactTelegram: '@atelier_support',
        contactPhone: '+7 (999) 000-11-22',
        deliveryEnabled: true,
        pickupEnabled: true,
        paymentEnabled: true,
        deliveryPrice: 350,
        freeDeliveryThreshold: 5000,
      };
    }
    return {
      storeName: row.store_name,
      description: row.description || '',
      logo: row.logo || '',
      currency: row.currency || 'RUB',
      contactTelegram: row.contact_telegram || '',
      contactPhone: row.contact_phone || '',
      deliveryEnabled: Boolean(row.delivery_enabled),
      pickupEnabled: Boolean(row.pickup_enabled),
      paymentEnabled: Boolean(row.payment_enabled),
      deliveryPrice: row.delivery_price,
      freeDeliveryThreshold: row.free_delivery_threshold,
    };
  }

  /**
   * Update store settings
   */
  public updateStoreSettings(data: Partial<StoreSettings>): StoreSettings {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM store_settings LIMIT 1').get() as any;
    const now = new Date().toISOString();

    const storeName = data.storeName ?? existing?.store_name ?? 'ATELIER';
    const description = data.description ?? existing?.description ?? '';
    const logo = data.logo ?? existing?.logo ?? '';
    const currency = data.currency ?? existing?.currency ?? 'RUB';
    const contactTelegram = data.contactTelegram ?? existing?.contact_telegram ?? '';
    const contactPhone = data.contactPhone ?? existing?.contact_phone ?? '';
    const deliveryEnabled = data.deliveryEnabled !== undefined ? (data.deliveryEnabled ? 1 : 0) : existing?.delivery_enabled ?? 1;
    const pickupEnabled = data.pickupEnabled !== undefined ? (data.pickupEnabled ? 1 : 0) : existing?.pickup_enabled ?? 1;
    const paymentEnabled = data.paymentEnabled !== undefined ? (data.paymentEnabled ? 1 : 0) : existing?.payment_enabled ?? 1;
    const deliveryPrice = data.deliveryPrice ?? existing?.delivery_price ?? 350;
    const freeDeliveryThreshold = data.freeDeliveryThreshold ?? existing?.free_delivery_threshold ?? 5000;

    if (existing) {
      db.prepare(`
        UPDATE store_settings SET
          store_name = ?, description = ?, logo = ?, currency = ?,
          contact_telegram = ?, contact_phone = ?,
          delivery_enabled = ?, pickup_enabled = ?, payment_enabled = ?,
          delivery_price = ?, free_delivery_threshold = ?, updated_at = ?
        WHERE id = ?
      `).run(
        storeName, description, logo, currency,
        contactTelegram, contactPhone,
        deliveryEnabled, pickupEnabled, paymentEnabled,
        deliveryPrice, freeDeliveryThreshold, now,
        existing.id
      );
    }

    return this.getStoreSettings();
  }

  /**
   * Get list of customers with order stats
   */
  public getCustomers(): any[] {
    const db = getDatabase();
    return db.prepare(`
      SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.role, u.created_at,
             COUNT(o.id) as orders_count,
             COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN o.total ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id
      ORDER BY total_spent DESC, orders_count DESC
    `).all() as any[];
  }

  /**
   * Get all orders with filtering and search
   */
  public getOrders(filters?: { status?: string; paymentStatus?: string; search?: string }): Order[] {
    const db = getDatabase();
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters?.status) {
      conditions.push('status = ?');
      values.push(filters.status);
    }
    if (filters?.paymentStatus) {
      conditions.push('payment_status = ?');
      values.push(filters.paymentStatus);
    }
    if (filters?.search) {
      conditions.push('(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
      const term = `%${filters.search}%`;
      values.push(term, term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC`).all(...values) as any[];

    const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');

    return rows.map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      userId: r.user_id,
      status: r.status,
      paymentStatus: r.payment_status,
      paymentProvider: r.payment_provider,
      paymentId: r.payment_id,
      subtotal: r.subtotal,
      deliveryPrice: r.delivery_price,
      total: r.total,
      currency: r.currency,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      customerUsername: r.customer_username,
      deliveryMethod: r.delivery_method,
      deliveryAddress: r.delivery_address,
      comment: r.comment,
      items: getItems.all(r.id) as any[],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Get recent notifications log
   */
  public getNotifications(): any[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 30').all();
  }
}
