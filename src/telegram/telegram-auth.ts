import crypto from 'node:crypto';
import { User, UserRole } from '../core/types.ts';
import { getDatabase } from '../database/db.ts';
import { UnauthorizedError } from '../core/errors.ts';

export interface TelegramAuthUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export class TelegramAuth {
  /**
   * Validate initData string against Telegram Bot Token HMAC-SHA256
   */
  public static validateInitData(initData: string, botToken: string): { isValid: boolean; user?: TelegramAuthUser } {
    if (!initData) {
      return { isValid: false };
    }

    try {
      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get('hash');
      if (!hash) {
        return { isValid: false };
      }

      // Check development bypass for mock sessions
      if (
        (process.env.NODE_ENV !== 'production' || !botToken || botToken === 'your_bot_token_here') &&
        initData.startsWith('mock_')
      ) {
        const rawUser = urlParams.get('user');
        const user = rawUser ? JSON.parse(rawUser) : undefined;
        return { isValid: true, user };
      }

      // Official Telegram algorithm:
      // 1. Collect all parameters except 'hash'
      // 2. Sort keys lexicographically
      // 3. Join with '\n' in 'key=value' format
      urlParams.delete('hash');
      const keys = Array.from(urlParams.keys()).sort();
      const dataCheckString = keys.map((key) => `${key}=${urlParams.get(key)}`).join('\n');

      // 4. HMAC-SHA-256 signature with "WebAppData" key
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(hash, 'hex'));

      if (!isValid) {
        return { isValid: false };
      }

      const rawUser = urlParams.get('user');
      const user: TelegramAuthUser | undefined = rawUser ? JSON.parse(rawUser) : undefined;

      // Check auth_date expiry (24 hours)
      const authDate = Number(urlParams.get('auth_date') || 0);
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (authDate > 0 && nowSeconds - authDate > 86400 * 2) {
        // Expired (allow 48h tolerance)
        return { isValid: false };
      }

      return { isValid: true, user };
    } catch (err) {
      return { isValid: false };
    }
  }

  /**
   * Upsert user in database and determine UserRole (ADMIN or CUSTOMER)
   */
  public static findOrCreateUser(tgUser: TelegramAuthUser): User {
    const db = getDatabase();
    const telegramId = String(tgUser.id);
    const now = new Date().toISOString();

    // Check if user is admin
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '123456789')
      .split(',')
      .map((id) => id.trim());
    const role: UserRole = adminIds.includes(telegramId) ? 'ADMIN' : 'CUSTOMER';

    const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as any;

    if (existing) {
      db.prepare(`
        UPDATE users SET
          username = ?,
          first_name = ?,
          last_name = ?,
          role = ?,
          updated_at = ?
        WHERE telegram_id = ?
      `).run(
        tgUser.username || existing.username,
        tgUser.first_name || existing.first_name,
        tgUser.last_name || existing.last_name,
        // preserve ADMIN if already assigned or in env
        existing.role === 'ADMIN' ? 'ADMIN' : role,
        now,
        telegramId
      );

      return {
        id: existing.id,
        telegramId: existing.telegram_id,
        username: tgUser.username || existing.username,
        firstName: tgUser.first_name || existing.first_name,
        lastName: tgUser.last_name || existing.last_name,
        role: existing.role === 'ADMIN' ? 'ADMIN' : role,
        createdAt: existing.created_at,
        updatedAt: now,
      };
    }

    const userId = `user_${crypto.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO users (id, telegram_id, username, first_name, last_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      telegramId,
      tgUser.username || null,
      tgUser.first_name || null,
      tgUser.last_name || null,
      role,
      now,
      now
    );

    return {
      id: userId,
      telegramId,
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
      role,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Helper to create a signed mock initData string for development/testing
   */
  public static createMockInitData(user: TelegramAuthUser, botToken = 'test_token'): string {
    const authDate = Math.floor(Date.now() / 1000);
    const userJson = JSON.stringify(user);

    const params = new URLSearchParams();
    params.set('auth_date', String(authDate));
    params.set('query_id', 'AAHdF60gAAAAAN0XrSC...');
    params.set('user', userJson);

    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    params.set('hash', hash);
    return params.toString();
  }
}
