import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

let instance: DatabaseSync | null = null;

export function getDatabase(dbPath?: string): DatabaseSync {
  if (instance) return instance;

  const targetPath = dbPath || process.env.DATABASE_URL?.replace('file:', '') || path.resolve(process.cwd(), 'data', 'store.db');

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);
  
  // Pragmas for performance and data integrity
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  initSchema(db);

  instance = db;
  return db;
}

export function resetDatabaseForTests(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  initSchema(db);
  instance = db;
  return db;
}

export function closeDatabase(): void {
  if (instance) {
    try {
      instance.close();
    } catch {
      // ignore
    }
    instance = null;
  }
}

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL DEFAULT 'CUSTOMER',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      id TEXT PRIMARY KEY,
      store_name TEXT NOT NULL,
      description TEXT,
      logo TEXT,
      currency TEXT NOT NULL DEFAULT 'RUB',
      contact_telegram TEXT,
      contact_phone TEXT,
      delivery_enabled INTEGER NOT NULL DEFAULT 1,
      pickup_enabled INTEGER NOT NULL DEFAULT 1,
      payment_enabled INTEGER NOT NULL DEFAULT 1,
      delivery_price REAL NOT NULL DEFAULT 350,
      free_delivery_threshold REAL NOT NULL DEFAULT 5000,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      image TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      category_id TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      price_override REAL,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cart_id, product_id, variant_id),
      FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW',
      payment_status TEXT NOT NULL DEFAULT 'PENDING',
      payment_provider TEXT NOT NULL DEFAULT 'mock',
      payment_id TEXT,
      subtotal REAL NOT NULL,
      delivery_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_username TEXT,
      delivery_method TEXT NOT NULL DEFAULT 'DELIVERY',
      delivery_address TEXT,
      comment TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      product_name_snapshot TEXT NOT NULL,
      variant_name_snapshot TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_payment_id TEXT UNIQUE NOT NULL,
      idempotency_key TEXT UNIQUE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_payment_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'RUB',
      raw_payload TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_type TEXT NOT NULL,
      recipient_telegram_id TEXT,
      order_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'SENT',
      created_at TEXT NOT NULL
    );

    -- Core Indexes for performance and constraints
    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_variants_sku ON product_variants(sku);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON payments(provider_payment_id);
    CREATE INDEX IF NOT EXISTS idx_payment_events_key ON payment_events(idempotency_key);
  `);
}
