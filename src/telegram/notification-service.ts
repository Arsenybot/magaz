import { Order, OrderStatus } from '../core/types.ts';
import { getDatabase } from '../database/db.ts';
import crypto from 'node:crypto';

export class NotificationService {
  private botToken: string;
  private adminTelegramIds: string[];

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.adminTelegramIds = (process.env.ADMIN_TELEGRAM_IDS || '123456789')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Send telegram message or record to database notifications log
   */
  public async sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
    const db = getDatabase();
    const id = `notif_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // Always record to notifications log for in-app display and auditing
    db.prepare(`
      INSERT INTO notifications (id, recipient_type, recipient_telegram_id, title, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      this.adminTelegramIds.includes(chatId) ? 'ADMIN' : 'CUSTOMER',
      chatId,
      'Уведомление Telegram',
      text,
      'SENT',
      now
    );

    // If bot token is real, dispatch via Telegram Bot API
    if (this.botToken && this.botToken !== 'your_bot_token_here') {
      try {
        const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
          }),
        });
        const data = await res.json();
        return data.ok;
      } catch (err) {
        console.error('Failed to send Telegram message:', err);
        return false;
      }
    }

    return true;
  }

  /**
   * Notify Admin about a newly created order
   */
  public async notifyAdminNewOrder(order: Order): Promise<void> {
    const db = getDatabase();
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) as any[];

    const itemsSummary = items
      .map((item) => `• ${item.product_name_snapshot} (${item.variant_name_snapshot}) × ${item.quantity} шт. = ${item.total_price} ${order.currency}`)
      .join('\n');

    const deliveryMethodText = order.deliveryMethod === 'DELIVERY' ? `Доставка курьером (${order.deliveryAddress || 'адрес не указан'})` : 'Самовывоз из магазина';

    const text = `🛍 <b>Новый заказ #${order.orderNumber}</b>

<b>Покупатель:</b> ${order.customerName}
<b>Телефон:</b> ${order.customerPhone}
${order.customerUsername ? `<b>Telegram:</b> @${order.customerUsername}\n` : ''}<b>Способ получения:</b> ${deliveryMethodText}
<b>Статус оплаты:</b> ${order.paymentStatus}

<b>Товары:</b>
${itemsSummary}

<b>Доставка:</b> ${order.deliveryPrice} ${order.currency}
<b>Итого к оплате:</b> ${order.total} ${order.currency}
${order.comment ? `\n<i>Комментарий: ${order.comment}</i>` : ''}`;

    for (const adminId of this.adminTelegramIds) {
      await this.sendTelegramMessage(adminId, text);
    }
  }

  /**
   * Notify Customer that order was successfully paid
   */
  public async notifyCustomerOrderPaid(order: Order): Promise<void> {
    const db = getDatabase();
    const userId = order.userId || (order as any).user_id;
    if (!userId) return;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user || !user.telegram_id) return;

    const orderNumber = order.orderNumber || (order as any).order_number;
    const currency = order.currency || 'RUB';

    const text = `✅ <b>Заказ #${orderNumber} успешно оплачен!</b>

Сумма: <b>${order.total} ${currency}</b>
Мы уже начали собирать ваш заказ. Вы получите сообщение, когда статус обновится.

Спасибо за покупку в ATELIER!`;

    await this.sendTelegramMessage(user.telegram_id, text);
  }

  /**
   * Notify Admin that payment was confirmed
   */
  public async notifyAdminOrderPaid(order: Order): Promise<void> {
    const orderNumber = order.orderNumber || (order as any).order_number;
    const customerName = order.customerName || (order as any).customer_name;
    const customerPhone = order.customerPhone || (order as any).customer_phone;
    const currency = order.currency || 'RUB';

    const text = `💰 <b>Заказ #${orderNumber} оплачен!</b>

Сумма: ${order.total} ${currency}
Покупатель: ${customerName} (${customerPhone})
Статус заказа: ${order.status}`;

    for (const adminId of this.adminTelegramIds) {
      await this.sendTelegramMessage(adminId, text);
    }
  }

  /**
   * Notify Customer about order status updates
   */
  public async notifyCustomerStatusChange(order: Order, oldStatus: OrderStatus, newStatus: OrderStatus): Promise<void> {
    const db = getDatabase();
    const userId = order.userId || (order as any).user_id;
    if (!userId) return;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user || !user.telegram_id) return;

    const orderNumber = order.orderNumber || (order as any).order_number;
    const deliveryMethod = order.deliveryMethod || (order as any).delivery_method;

    const statusDescriptions: Record<OrderStatus, string> = {
      NEW: 'создан',
      PAYMENT_PENDING: 'ожидает оплаты',
      PAID: 'оплачен',
      PROCESSING: 'принят в обработку и комплектуется',
      READY: deliveryMethod === 'PICKUP' ? 'готов к самовывозу' : 'передан курьеру для доставки',
      COMPLETED: 'успешно завершен. Спасибо, что вы с нами!',
      CANCELLED: 'отменен',
      REFUNDED: 'возвращен',
    };

    const text = `📦 <b>Статус заказа #${orderNumber} обновлен:</b>

Новый статус: <b>${statusDescriptions[newStatus] || newStatus}</b>
${newStatus === 'READY' && deliveryMethod === 'PICKUP' ? '\nАдрес магазина: ул. Большая Конюшенная, 12, ежедневно с 10:00 до 22:00.' : ''}`;

    await this.sendTelegramMessage(user.telegram_id, text);
  }
}
