import { getDatabase } from '../database/db.ts';

export class TelegramBotAdapter {
  private botToken: string;
  private webAppUrl: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.webAppUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.APP_URL || 'https://localhost:3000';
  }

  /**
   * Process incoming webhook update from Telegram
   */
  public async handleUpdate(update: any): Promise<any> {
    if (!update) return { ok: true };

    const message = update.message;
    if (!message || !message.text) return { ok: true };

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const deepLink = parts[1]; // optional deep link e.g. /start prod_123

      let targetUrl = this.webAppUrl;
      if (deepLink) {
        targetUrl += `?startapp=${encodeURIComponent(deepLink)}`;
      }

      await this.sendMessage(chatId, `👋 <b>Добро пожаловать в магазин ATELIER!</b>\n\nЗдесь вы найдете концептуальную одежду и базовый гардероб из премиального хлопка.\n\nНажмите кнопку ниже, чтобы открыть каталог:`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛍 Открыть магазин',
                web_app: { url: targetUrl },
              },
            ],
            [
              {
                text: '📦 Мои заказы',
                web_app: { url: `${this.webAppUrl}?tab=orders` },
              },
            ],
          ],
        },
      });
      return { ok: true };
    }

    if (text === '/help') {
      await this.sendMessage(
        chatId,
        `ℹ️ <b>Справка ATELIER:</b>\n\n• /start — главное меню и ссылка в магазин\n• /orders — проверить статус последних заказов\n• /admin — админ-панель (только для менеджеров)`
      );
      return { ok: true };
    }

    if (text === '/orders') {
      const db = getDatabase();
      const user = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(String(chatId)) as any;
      if (!user) {
        await this.sendMessage(chatId, 'Вы еще не делали заказов в магазине. Нажмите кнопку "Открыть магазин" в /start');
        return { ok: true };
      }

      const orders = db.prepare('SELECT order_number, status, total, currency FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5').all(user.id) as any[];
      if (!orders || orders.length === 0) {
        await this.sendMessage(chatId, 'У вас пока нет оформленных заказов.');
        return { ok: true };
      }

      const list = orders.map((o) => `• <b>#${o.order_number}</b>: ${o.status} (${o.total} ${o.currency})`).join('\n');
      await this.sendMessage(chatId, `📋 <b>Ваши недавние заказы:</b>\n\n${list}`);
      return { ok: true };
    }

    if (text === '/admin') {
      const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '123456789').split(',').map((s) => s.trim());
      if (!adminIds.includes(String(chatId))) {
        await this.sendMessage(chatId, '⛔️ У вас нет прав администратора.');
        return { ok: true };
      }

      await this.sendMessage(chatId, `⚙️ <b>Панель управления магазином</b>\n\nНажмите кнопку для перехода в админку:`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛠 Открыть админ-панель',
                web_app: { url: `${this.webAppUrl}?mode=admin` },
              },
            ],
          ],
        },
      });
      return { ok: true };
    }

    return { ok: true };
  }

  private async sendMessage(chatId: string | number, text: string, extra: any = {}): Promise<boolean> {
    if (!this.botToken || this.botToken === 'your_bot_token_here') {
      // In dev mode when token isn't configured, log harmlessly
      return true;
    }

    try {
      const body = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...extra,
      };

      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
