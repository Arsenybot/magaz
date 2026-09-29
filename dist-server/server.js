// server.ts
import express from "express";
import dotenv from "dotenv";
import path2 from "node:path";
import { fileURLToPath } from "node:url";

// src/api/routes.ts
import { Router } from "express";

// src/database/db.ts
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
var instance = null;
function getDatabase(dbPath) {
  if (instance) return instance;
  const targetPath = dbPath || process.env.DATABASE_URL?.replace("file:", "") || path.resolve(process.cwd(), "data", "store.db");
  if (targetPath !== ":memory:") {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  const db = new DatabaseSync(targetPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  initSchema(db);
  instance = db;
  return db;
}
function initSchema(db) {
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

// src/core/errors.ts
var AppError = class extends Error {
  constructor(message, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var NotFoundError = class extends AppError {
  constructor(entity, id) {
    super(`${entity} ${id ? `with identifier "${id}" ` : ""}not found.`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
};
var ValidationError = class extends AppError {
  constructor(message) {
    super(message, 422, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
};
var InsufficientStockError = class extends AppError {
  constructor(productName, requested, available) {
    super(
      `\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u0442\u043E\u0432\u0430\u0440\u0430 "${productName}" \u043D\u0430 \u0441\u043A\u043B\u0430\u0434\u0435. \u0417\u0430\u043F\u0440\u043E\u0448\u0435\u043D\u043E: ${requested}, \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E: ${available}.`,
      409,
      "INSUFFICIENT_STOCK"
    );
    this.name = "InsufficientStockError";
  }
};
var InvalidStateTransitionError = class extends AppError {
  constructor(fromState, toState) {
    super(
      `\u041D\u0435\u0434\u043E\u043F\u0443\u0441\u0442\u0438\u043C\u044B\u0439 \u043F\u0435\u0440\u0435\u0445\u043E\u0434 \u0441\u0442\u0430\u0442\u0443\u0441\u0430 \u0437\u0430\u043A\u0430\u0437\u0430 \u0438\u0437 "${fromState}" \u0432 "${toState}".`,
      400,
      "INVALID_STATE_TRANSITION"
    );
    this.name = "InvalidStateTransitionError";
  }
};
var ForbiddenError = class extends AppError {
  constructor(message = "\u0414\u043E\u0441\u0442\u0443\u043F \u0437\u0430\u043F\u0440\u0435\u0449\u0451\u043D.") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
};
var UnauthorizedError = class extends AppError {
  constructor(message = "\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044F.") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
};

// src/services/catalog-service.ts
import crypto from "node:crypto";
var CatalogService = class {
  /**
   * Get all active categories ordered by sortOrder
   */
  getCategories(includeInactive = false) {
    const db = getDatabase();
    const query = includeInactive ? "SELECT * FROM categories ORDER BY sort_order ASC" : "SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC";
    const rows = db.prepare(query).all();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description || "",
      image: r.image || "",
      sortOrder: r.sort_order,
      active: Boolean(r.active),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }
  /**
   * Get catalog products with optional filters
   */
  getProducts(params) {
    const db = getDatabase();
    const conditions = [];
    const values = [];
    const status = params?.status || "ACTIVE";
    conditions.push("p.status = ?");
    values.push(status);
    if (params?.categoryId) {
      conditions.push("p.category_id = ?");
      values.push(params.categoryId);
    }
    if (params?.search) {
      conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
      const term = `%${params.search}%`;
      values.push(term, term);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.created_at DESC
    `;
    const products = db.prepare(sql).all(...values);
    const getVariantsStmt = db.prepare(`
      SELECT * FROM product_variants WHERE product_id = ? AND status = 'ACTIVE' ORDER BY size ASC
    `);
    return products.map((p) => {
      const variants = getVariantsStmt.all(p.id);
      const totalStock = variants.reduce((sum, v) => sum + v.stock_quantity, 0);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description || "",
        price: p.price,
        currency: p.currency,
        categoryId: p.category_id,
        categoryName: p.category_name,
        images: JSON.parse(p.images || "[]"),
        status: p.status,
        variants: variants.map((v) => ({
          id: v.id,
          productId: v.product_id,
          name: v.name,
          size: v.size,
          sku: v.sku,
          priceOverride: v.price_override,
          stockQuantity: v.stock_quantity,
          status: v.status
        })),
        totalStock,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      };
    });
  }
  /**
   * Get single product with full variants and category details
   */
  getProductById(id) {
    const db = getDatabase();
    const p = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(id);
    if (!p) {
      throw new NotFoundError("Product", id);
    }
    const variants = db.prepare(`
      SELECT * FROM product_variants WHERE product_id = ? ORDER BY size ASC
    `).all(p.id);
    const totalStock = variants.reduce((sum, v) => sum + v.stock_quantity, 0);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description || "",
      price: p.price,
      currency: p.currency,
      categoryId: p.category_id,
      categoryName: p.category_name,
      images: JSON.parse(p.images || "[]"),
      status: p.status,
      variants: variants.map((v) => ({
        id: v.id,
        productId: v.product_id,
        name: v.name,
        size: v.size,
        sku: v.sku,
        priceOverride: v.price_override,
        stockQuantity: v.stock_quantity,
        status: v.status
      })),
      totalStock,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    };
  }
  /**
   * Admin: Create category
   */
  createCategory(data) {
    if (!data.name) throw new ValidationError("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E");
    const db = getDatabase();
    const id = `cat_${crypto.randomUUID().slice(0, 8)}`;
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, "-");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO categories (id, name, slug, description, image, sort_order, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, slug, data.description || "", data.image || "", data.sortOrder || 0, data.active !== false ? 1 : 0, now, now);
    return {
      id,
      name: data.name,
      slug,
      description: data.description || "",
      image: data.image || "",
      sortOrder: data.sortOrder || 0,
      active: data.active !== false,
      createdAt: now,
      updatedAt: now
    };
  }
  /**
   * Admin: Update category
   */
  updateCategory(id, data) {
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
    if (!existing) throw new NotFoundError("Category", id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const name = data.name !== void 0 ? data.name : existing.name;
    const slug = data.slug !== void 0 ? data.slug : existing.slug;
    const description = data.description !== void 0 ? data.description : existing.description;
    const image = data.image !== void 0 ? data.image : existing.image;
    const sortOrder = data.sortOrder !== void 0 ? data.sortOrder : existing.sort_order;
    const active = data.active !== void 0 ? data.active ? 1 : 0 : existing.active;
    db.prepare(`
      UPDATE categories SET
        name = ?, slug = ?, description = ?, image = ?, sort_order = ?, active = ?, updated_at = ?
      WHERE id = ?
    `).run(name, slug, description, image, sortOrder, active, now, id);
    return {
      id,
      name,
      slug,
      description,
      image,
      sortOrder,
      active: Boolean(active),
      createdAt: existing.created_at,
      updatedAt: now
    };
  }
  /**
   * Admin: Delete category
   */
  deleteCategory(id) {
    const db = getDatabase();
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  }
  /**
   * Admin: Create product with variants
   */
  createProduct(data) {
    if (!data.name) throw new ValidationError("\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0442\u043E\u0432\u0430\u0440\u0430 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E");
    if (!data.price || data.price < 0) throw new ValidationError("\u0426\u0435\u043D\u0430 \u0442\u043E\u0432\u0430\u0440\u0430 \u0434\u043E\u043B\u0436\u043D\u0430 \u0431\u044B\u0442\u044C \u043F\u043E\u043B\u043E\u0436\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0439");
    if (!data.categoryId) throw new ValidationError("\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u044F \u0442\u043E\u0432\u0430\u0440\u0430 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430");
    const db = getDatabase();
    const id = `prod_${crypto.randomUUID().slice(0, 8)}`;
    const slug = data.slug || `${data.name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, "-")}-${id.slice(-4)}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const imagesJson = JSON.stringify(data.images || []);
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(`
        INSERT INTO products (id, name, slug, description, price, currency, category_id, images, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.name,
        slug,
        data.description || "",
        data.price,
        data.currency || "RUB",
        data.categoryId,
        imagesJson,
        data.status || "ACTIVE",
        now,
        now
      );
      const variants = data.variants && data.variants.length > 0 ? data.variants : [
        { name: "ONE SIZE", size: "ONE SIZE", sku: `${slug.toUpperCase()}-OS`, stockQuantity: 10 }
      ];
      const insertVariantStmt = db.prepare(`
        INSERT INTO product_variants (id, product_id, name, size, sku, price_override, stock_quantity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      `);
      for (const v of variants) {
        const vId = `var_${crypto.randomUUID().slice(0, 8)}`;
        insertVariantStmt.run(vId, id, v.name, v.size, v.sku, v.priceOverride || null, v.stockQuantity || 0);
      }
      db.exec("COMMIT;");
      return this.getProductById(id);
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
  }
  /**
   * Admin: Update product and optionally replace/update variants
   */
  updateProduct(id, data) {
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
    if (!existing) throw new NotFoundError("Product", id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const name = data.name !== void 0 ? data.name : existing.name;
    const slug = data.slug !== void 0 ? data.slug : existing.slug;
    const description = data.description !== void 0 ? data.description : existing.description;
    const price = data.price !== void 0 ? data.price : existing.price;
    const categoryId = data.categoryId !== void 0 ? data.categoryId : existing.category_id;
    const status = data.status !== void 0 ? data.status : existing.status;
    const imagesJson = data.images !== void 0 ? JSON.stringify(data.images) : existing.images;
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(`
        UPDATE products SET
          name = ?, slug = ?, description = ?, price = ?, category_id = ?, images = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(name, slug, description, price, categoryId, imagesJson, status, now, id);
      if (data.variants && Array.isArray(data.variants)) {
        for (const v of data.variants) {
          if (v.id) {
            db.prepare(`
              UPDATE product_variants SET
                name = ?, size = ?, sku = ?, price_override = ?, stock_quantity = ?, status = ?
              WHERE id = ? AND product_id = ?
            `).run(v.name, v.size, v.sku, v.priceOverride || null, v.stockQuantity, v.status || "ACTIVE", v.id, id);
          } else {
            const vId = `var_${crypto.randomUUID().slice(0, 8)}`;
            db.prepare(`
              INSERT INTO product_variants (id, product_id, name, size, sku, price_override, stock_quantity, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            `).run(vId, id, v.name, v.size, v.sku, v.priceOverride || null, v.stockQuantity);
          }
        }
      }
      db.exec("COMMIT;");
      return this.getProductById(id);
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
  }
  /**
   * Admin: Delete product
   */
  deleteProduct(id) {
    const db = getDatabase();
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
  }
};

// src/services/cart-service.ts
import crypto2 from "node:crypto";
var CartService = class {
  /**
   * Get or create a cart for the specified user
   */
  getOrCreateCart(userId) {
    const db = getDatabase();
    let cart = db.prepare("SELECT * FROM carts WHERE user_id = ?").get(userId);
    if (!cart) {
      const cartId = `cart_${crypto2.randomUUID().slice(0, 8)}`;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db.prepare(`
        INSERT INTO carts (id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(cartId, userId, now, now);
      cart = { id: cartId, user_id: userId, created_at: now, updated_at: now };
    }
    const itemsRows = db.prepare(`
      SELECT ci.*,
             p.name as product_name, p.slug as product_slug, p.price as product_price, p.currency as product_currency,
             p.images as product_images, p.status as product_status,
             pv.name as variant_name, pv.size as variant_size, pv.sku as variant_sku,
             pv.price_override, pv.stock_quantity, pv.status as variant_status
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      JOIN product_variants pv ON ci.variant_id = pv.id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at ASC
    `).all(cart.id);
    let subtotal = 0;
    let itemsCount = 0;
    const items = itemsRows.map((row) => {
      const unitPrice = row.price_override !== null && row.price_override !== void 0 ? row.price_override : row.product_price;
      const isAvailable = row.product_status === "ACTIVE" && row.variant_status === "ACTIVE" && row.stock_quantity >= row.quantity;
      const totalPrice = unitPrice * row.quantity;
      if (isAvailable) {
        subtotal += totalPrice;
      }
      itemsCount += row.quantity;
      const product = {
        id: row.product_id,
        name: row.product_name,
        slug: row.product_slug,
        description: "",
        price: row.product_price,
        currency: row.product_currency,
        categoryId: "",
        images: JSON.parse(row.product_images || "[]"),
        status: row.product_status,
        createdAt: "",
        updatedAt: ""
      };
      const variant = {
        id: row.variant_id,
        productId: row.product_id,
        name: row.variant_name,
        size: row.variant_size,
        sku: row.variant_sku,
        priceOverride: row.price_override,
        stockQuantity: row.stock_quantity,
        status: row.variant_status
      };
      return {
        id: row.id,
        cartId: row.cart_id,
        productId: row.product_id,
        variantId: row.variant_id,
        quantity: row.quantity,
        product,
        variant,
        unitPrice,
        totalPrice,
        isAvailable,
        availableStock: row.stock_quantity
      };
    });
    return {
      id: cart.id,
      userId,
      items,
      subtotal,
      itemsCount
    };
  }
  /**
   * Add item to cart with stock validation
   */
  addItem(userId, productId, variantId, quantity = 1) {
    if (quantity <= 0) throw new ValidationError("\u041A\u043E\u043B\u0438\u0447\u0435\u0441\u0442\u0432\u043E \u0434\u043E\u043B\u0436\u043D\u043E \u0431\u044B\u0442\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0443\u043B\u044F");
    const db = getDatabase();
    const cart = this.getOrCreateCart(userId);
    const variant = db.prepare(`
      SELECT pv.*, p.name as product_name, p.status as product_status
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ? AND pv.product_id = ?
    `).get(variantId, productId);
    if (!variant || variant.product_status !== "ACTIVE" || variant.status !== "ACTIVE") {
      throw new NotFoundError("\u0422\u043E\u0432\u0430\u0440 \u0438\u043B\u0438 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u0440\u0430\u0437\u043C\u0435\u0440 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u043A \u0437\u0430\u043A\u0430\u0437\u0443");
    }
    const existingItem = db.prepare(`
      SELECT * FROM cart_items WHERE cart_id = ? AND variant_id = ?
    `).get(cart.id, variantId);
    const currentQtyInCart = existingItem ? existingItem.quantity : 0;
    const requestedTotal = currentQtyInCart + quantity;
    if (requestedTotal > variant.stock_quantity) {
      throw new InsufficientStockError(variant.product_name, requestedTotal, variant.stock_quantity);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (existingItem) {
      db.prepare(`
        UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?
      `).run(requestedTotal, now, existingItem.id);
    } else {
      const itemId = `ci_${crypto2.randomUUID().slice(0, 8)}`;
      db.prepare(`
        INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(itemId, cart.id, productId, variantId, quantity, now, now);
    }
    return this.getOrCreateCart(userId);
  }
  /**
   * Update item quantity in cart
   */
  updateItemQuantity(userId, cartItemId, quantity) {
    const db = getDatabase();
    const cart = this.getOrCreateCart(userId);
    const item = db.prepare(`
      SELECT ci.*, pv.stock_quantity, p.name as product_name
      FROM cart_items ci
      JOIN product_variants pv ON ci.variant_id = pv.id
      JOIN products p ON ci.product_id = p.id
      WHERE ci.id = ? AND ci.cart_id = ?
    `).get(cartItemId, cart.id);
    if (!item) {
      throw new NotFoundError("\u042D\u043B\u0435\u043C\u0435\u043D\u0442 \u043A\u043E\u0440\u0437\u0438\u043D\u044B", cartItemId);
    }
    if (quantity <= 0) {
      db.prepare("DELETE FROM cart_items WHERE id = ?").run(cartItemId);
    } else {
      if (quantity > item.stock_quantity) {
        throw new InsufficientStockError(item.product_name, quantity, item.stock_quantity);
      }
      db.prepare("UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?").run(
        quantity,
        (/* @__PURE__ */ new Date()).toISOString(),
        cartItemId
      );
    }
    return this.getOrCreateCart(userId);
  }
  /**
   * Remove item from cart
   */
  removeItem(userId, cartItemId) {
    const db = getDatabase();
    const cart = this.getOrCreateCart(userId);
    db.prepare("DELETE FROM cart_items WHERE id = ? AND cart_id = ?").run(cartItemId, cart.id);
    return this.getOrCreateCart(userId);
  }
  /**
   * Clear user's cart
   */
  clearCart(userId) {
    const db = getDatabase();
    const cart = db.prepare("SELECT id FROM carts WHERE user_id = ?").get(userId);
    if (cart) {
      db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cart.id);
    }
  }
};

// src/core/order-state-machine.ts
var ALLOWED_TRANSITIONS = {
  NEW: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "REFUNDED"],
  PROCESSING: ["READY", "REFUNDED", "CANCELLED"],
  READY: ["COMPLETED", "REFUNDED", "CANCELLED"],
  COMPLETED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: []
};
var OrderStateMachine = class {
  /**
   * Check if transition is allowed
   */
  static canTransition(from, to) {
    if (from === to) return true;
    const allowed = ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }
  /**
   * Assert transition is valid or throw InvalidStateTransitionError
   */
  static validateTransition(from, to) {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }
  /**
   * Returns list of reachable states from current state
   */
  static getAllowedNextStates(current) {
    return ALLOWED_TRANSITIONS[current] || [];
  }
};

// src/services/order-service.ts
import crypto3 from "node:crypto";
var OrderService = class {
  constructor(cartService, notificationService) {
    this.cartService = cartService;
    this.notificationService = notificationService;
  }
  /**
   * Create an order from current user's cart
   */
  async createOrder(input) {
    if (!input.customerName || !input.customerName.trim()) {
      throw new ValidationError("\u0418\u043C\u044F \u043F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044F \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E \u0434\u043B\u044F \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u044F \u0437\u0430\u043A\u0430\u0437\u0430");
    }
    if (!input.customerPhone || !input.customerPhone.trim()) {
      throw new ValidationError("\u041D\u043E\u043C\u0435\u0440 \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D \u0434\u043B\u044F \u0441\u0432\u044F\u0437\u0438");
    }
    if (input.deliveryMethod === "DELIVERY" && (!input.deliveryAddress || !input.deliveryAddress.trim())) {
      throw new ValidationError("\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438");
    }
    const db = getDatabase();
    const settings = db.prepare("SELECT * FROM store_settings LIMIT 1").get();
    const baseDeliveryPrice = settings?.delivery_price ?? 350;
    const freeDeliveryThreshold = settings?.free_delivery_threshold ?? 5e3;
    const currency = settings?.currency || "RUB";
    const cart = this.cartService.getOrCreateCart(input.userId);
    if (!cart.items || cart.items.length === 0) {
      throw new AppError("\u041A\u043E\u0440\u0437\u0438\u043D\u0430 \u043F\u0443\u0441\u0442\u0430. \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0442\u043E\u0432\u0430\u0440\u044B \u043F\u0435\u0440\u0435\u0434 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435\u043C \u0437\u0430\u043A\u0430\u0437\u0430.", 400);
    }
    const orderId = `ord_${crypto3.randomUUID().slice(0, 8)}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const lastOrder = db.prepare("SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 1").get();
    const nextNum = lastOrder && !isNaN(Number(lastOrder.order_number)) ? Number(lastOrder.order_number) + 1 : 1001;
    const orderNumber = String(nextNum);
    db.exec("BEGIN IMMEDIATE;");
    try {
      let subtotal = 0;
      const orderItemsToInsert = [];
      for (const item of cart.items) {
        const variant = db.prepare(`
          SELECT pv.*, p.name as product_name, p.price as base_product_price, p.status as product_status
          FROM product_variants pv
          JOIN products p ON pv.product_id = p.id
          WHERE pv.id = ?
        `).get(item.variantId);
        if (!variant || variant.product_status !== "ACTIVE" || variant.status !== "ACTIVE") {
          throw new AppError(`\u0422\u043E\u0432\u0430\u0440 "${item.product?.name || item.productId}" \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D`, 400);
        }
        if (variant.stock_quantity < item.quantity) {
          throw new InsufficientStockError(variant.product_name, item.quantity, variant.stock_quantity);
        }
        const unitPrice = variant.price_override !== null && variant.price_override !== void 0 ? variant.price_override : variant.base_product_price;
        const itemTotal = unitPrice * item.quantity;
        subtotal += itemTotal;
        db.prepare(`
          UPDATE product_variants
          SET stock_quantity = stock_quantity - ?
          WHERE id = ? AND stock_quantity >= ?
        `).run(item.quantity, variant.id, item.quantity);
        orderItemsToInsert.push({
          id: `oi_${crypto3.randomUUID().slice(0, 8)}`,
          orderId,
          productId: variant.product_id,
          variantId: variant.id,
          productNameSnapshot: variant.product_name,
          variantNameSnapshot: variant.name,
          quantity: item.quantity,
          unitPrice,
          totalPrice: itemTotal
        });
      }
      let deliveryPrice = 0;
      if (input.deliveryMethod === "DELIVERY") {
        deliveryPrice = subtotal >= freeDeliveryThreshold ? 0 : baseDeliveryPrice;
      }
      const total = subtotal + deliveryPrice;
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
        "NEW",
        "PENDING",
        input.paymentProvider || "mock",
        subtotal,
        deliveryPrice,
        total,
        currency,
        input.customerName.trim(),
        input.customerPhone.trim(),
        input.customerUsername?.replace("@", "").trim() || null,
        input.deliveryMethod,
        input.deliveryAddress?.trim() || null,
        input.comment?.trim() || null,
        now,
        now
      );
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
      db.prepare("DELETE FROM cart_items WHERE cart_id = ?").run(cart.id);
      db.exec("COMMIT;");
      const createdOrder = this.getOrderById(orderId);
      this.notificationService.notifyAdminNewOrder(createdOrder).catch(console.error);
      return createdOrder;
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
  }
  /**
   * Get order by ID with authorization check
   */
  getOrderById(orderId, requestingUser) {
    const db = getDatabase();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) {
      throw new NotFoundError("Order", orderId);
    }
    if (requestingUser && requestingUser.role !== "ADMIN" && order.user_id !== requestingUser.id) {
      throw new ForbiddenError("\u0423 \u0432\u0430\u0441 \u043D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430 \u043A \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0443 \u044D\u0442\u043E\u0433\u043E \u0437\u0430\u043A\u0430\u0437\u0430.");
    }
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
    return {
      id: order.id,
      orderNumber: order.order_number,
      userId: order.user_id,
      status: order.status,
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
        totalPrice: i.total_price
      })),
      createdAt: order.created_at,
      updatedAt: order.updated_at
    };
  }
  /**
   * Get orders for specific user
   */
  getUserOrders(userId) {
    const db = getDatabase();
    const rows = db.prepare("SELECT id FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(userId);
    return rows.map((r) => this.getOrderById(r.id));
  }
  /**
   * Update order status with state machine enforcement and stock rollback if CANCELLED
   */
  async updateOrderStatus(orderId, newStatus, adminUser) {
    if (adminUser.role !== "ADMIN") {
      throw new ForbiddenError("\u0422\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440 \u043C\u043E\u0436\u0435\u0442 \u0438\u0437\u043C\u0435\u043D\u044F\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u043A\u0430\u0437\u0430.");
    }
    const db = getDatabase();
    const order = this.getOrderById(orderId);
    const oldStatus = order.status;
    OrderStateMachine.validateTransition(oldStatus, newStatus);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.exec("BEGIN IMMEDIATE;");
    try {
      if (newStatus === "CANCELLED" && oldStatus !== "CANCELLED") {
        const items = db.prepare("SELECT variant_id, quantity FROM order_items WHERE order_id = ?").all(orderId);
        for (const item of items) {
          db.prepare(`
            UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?
          `).run(item.quantity, item.variant_id);
        }
      }
      db.prepare(`
        UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
      `).run(newStatus, now, orderId);
      db.exec("COMMIT;");
      const updated = this.getOrderById(orderId);
      this.notificationService.notifyCustomerStatusChange(updated, oldStatus, newStatus).catch(console.error);
      return updated;
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
  }
};

// src/payments/mock-provider.ts
import crypto4 from "node:crypto";
var MockPaymentProvider = class {
  constructor() {
    this.name = "mock";
    const isProd = process.env.NODE_ENV === "production";
    const allowMock = process.env.ALLOW_MOCK_PAYMENTS === "true";
    if (isProd && !allowMock) {
      throw new AppError("MockPaymentProvider cannot be initialized in production environment.", 500, "SECURITY_VIOLATION");
    }
  }
  async createPayment(input) {
    const providerPaymentId = `mock_pay_${crypto4.randomUUID().slice(0, 8)}`;
    const paymentUrl = `/payment/mock?id=${providerPaymentId}&orderId=${input.orderId}&amount=${input.amount}&currency=${input.currency}`;
    return {
      provider: this.name,
      providerPaymentId,
      paymentUrl,
      status: "PENDING",
      isTestMode: true,
      expiresAt: new Date(Date.now() + 15 * 60 * 1e3).toISOString()
    };
  }
  async getPaymentStatus(providerPaymentId) {
    return {
      providerPaymentId,
      status: "PAID",
      amount: 0,
      currency: "RUB",
      paidAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async handleWebhook(payload) {
    if (!payload || !payload.providerPaymentId || !payload.orderId) {
      throw new AppError("Invalid mock payment webhook payload", 400);
    }
    const idempotencyKey = payload.idempotencyKey || `mock_evt_${payload.providerPaymentId}_${payload.status || "PAID"}`;
    return {
      provider: this.name,
      providerPaymentId: payload.providerPaymentId,
      orderId: payload.orderId,
      idempotencyKey,
      status: payload.status || "PAID",
      amount: Number(payload.amount) || 0,
      currency: payload.currency || "RUB",
      eventType: payload.eventType || "payment.succeeded",
      rawPayload: payload
    };
  }
  async refundPayment(providerPaymentId, amount) {
    return {
      success: true,
      refundId: `mock_ref_${crypto4.randomUUID().slice(0, 8)}`,
      status: "SUCCEEDED",
      amount: amount || 0
    };
  }
};

// src/payments/yookassa-provider.ts
import crypto5 from "node:crypto";
var YooKassaPaymentProvider = class {
  constructor() {
    this.name = "yookassa";
    this.shopId = process.env.PAYMENT_API_KEY || "";
    this.secretKey = process.env.PAYMENT_SECRET || "";
  }
  async createPayment(input) {
    if (!this.shopId || !this.secretKey) {
      throw new AppError("YooKassa credentials missing in environment (PAYMENT_API_KEY and PAYMENT_SECRET).", 500);
    }
    const idempotencyKey = crypto5.randomUUID();
    const authHeader = "Basic " + Buffer.from(`${this.shopId}:${this.secretKey}`).toString("base64");
    const body = {
      amount: {
        value: input.amount.toFixed(2),
        currency: input.currency === "RUB" ? "RUB" : input.currency
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: input.returnUrl
      },
      description: input.description,
      metadata: {
        orderId: input.orderId,
        orderNumber: input.orderNumber
      }
    };
    try {
      const res = await fetch("https://api.yookassa.ru/v3/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
          "Idempotence-Key": idempotencyKey
        },
        body: JSON.stringify(body)
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
        status: data.status === "succeeded" ? "PAID" : "PENDING",
        isTestMode: false
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Failed to create YooKassa payment: ${err.message}`, 502);
    }
  }
  async getPaymentStatus(providerPaymentId) {
    const authHeader = "Basic " + Buffer.from(`${this.shopId}:${this.secretKey}`).toString("base64");
    const res = await fetch(`https://api.yookassa.ru/v3/payments/${providerPaymentId}`, {
      headers: { Authorization: authHeader }
    });
    if (!res.ok) throw new AppError(`YooKassa fetch failed: ${res.statusText}`, res.status);
    const data = await res.json();
    return {
      providerPaymentId: data.id,
      status: data.status === "succeeded" ? "PAID" : "PENDING",
      amount: parseFloat(data.amount.value),
      currency: data.amount.currency,
      paidAt: data.captured_at
    };
  }
  async handleWebhook(payload) {
    const event = payload?.event;
    const object = payload?.object;
    if (!object || !object.id) {
      throw new AppError("Invalid YooKassa webhook payload", 400);
    }
    const orderId = object.metadata?.orderId;
    if (!orderId) {
      throw new AppError("Missing orderId in YooKassa webhook metadata", 400);
    }
    return {
      provider: this.name,
      providerPaymentId: object.id,
      orderId,
      idempotencyKey: payload.id || `yk_${object.id}_${event}`,
      status: object.status === "succeeded" ? "PAID" : "PENDING",
      amount: parseFloat(object.amount?.value || "0"),
      currency: object.amount?.currency || "RUB",
      eventType: event || "payment.succeeded",
      rawPayload: payload
    };
  }
  async refundPayment(providerPaymentId, amount) {
    const idempotencyKey = crypto5.randomUUID();
    const authHeader = "Basic " + Buffer.from(`${this.shopId}:${this.secretKey}`).toString("base64");
    const body = { payment_id: providerPaymentId };
    if (amount) body.amount = { value: amount.toFixed(2), currency: "RUB" };
    const res = await fetch("https://api.yookassa.ru/v3/refunds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "Idempotence-Key": idempotencyKey
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new AppError("YooKassa refund failed", res.status);
    const data = await res.json();
    return {
      success: data.status === "succeeded",
      refundId: data.id,
      status: data.status === "succeeded" ? "SUCCEEDED" : "PENDING",
      amount: parseFloat(data.amount?.value || "0")
    };
  }
};

// src/payments/telegram-provider.ts
import crypto6 from "node:crypto";
var TelegramPaymentProvider = class {
  constructor() {
    this.name = "telegram";
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  }
  async createPayment(input) {
    if (!this.botToken || this.botToken === "your_bot_token_here") {
      const fallbackId = `tg_pay_${crypto6.randomUUID().slice(0, 8)}`;
      return {
        provider: this.name,
        providerPaymentId: fallbackId,
        paymentUrl: `/payment/mock?id=${fallbackId}&orderId=${input.orderId}&amount=${input.amount}&currency=${input.currency}`,
        status: "PENDING",
        isTestMode: true
      };
    }
    try {
      const payload = {
        title: `\u0417\u0430\u043A\u0430\u0437 #${input.orderNumber}`,
        description: input.description,
        payload: JSON.stringify({ orderId: input.orderId, orderNumber: input.orderNumber }),
        currency: input.currency === "RUB" ? "RUB" : "XTR",
        prices: [{ label: `\u0417\u0430\u043A\u0430\u0437 #${input.orderNumber}`, amount: Math.round(input.amount * 100) }]
      };
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/createInvoiceLink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) {
        throw new AppError(`Telegram Invoice API error: ${data.description}`, 400);
      }
      const providerPaymentId = `tg_inv_${crypto6.randomUUID().slice(0, 8)}`;
      return {
        provider: this.name,
        providerPaymentId,
        paymentUrl: data.result,
        status: "PENDING",
        isTestMode: false
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Telegram Payments failed: ${err.message}`, 502);
    }
  }
  async getPaymentStatus(providerPaymentId) {
    return {
      providerPaymentId,
      status: "PAID",
      amount: 0,
      currency: "RUB"
    };
  }
  async handleWebhook(payload) {
    const successfulPayment = payload?.message?.successful_payment;
    if (!successfulPayment) {
      throw new AppError("Invalid Telegram payment webhook update", 400);
    }
    let invoicePayload = {};
    try {
      invoicePayload = JSON.parse(successfulPayment.invoice_payload);
    } catch {
    }
    const orderId = invoicePayload.orderId || payload.orderId;
    const providerPaymentId = successfulPayment.telegram_payment_charge_id || `tg_chg_${Date.now()}`;
    return {
      provider: this.name,
      providerPaymentId,
      orderId,
      idempotencyKey: `tg_evt_${providerPaymentId}`,
      status: "PAID",
      amount: successfulPayment.total_amount / 100,
      currency: successfulPayment.currency,
      eventType: "successful_payment",
      rawPayload: payload
    };
  }
  async refundPayment(providerPaymentId, amount) {
    return {
      success: true,
      refundId: `tg_ref_${crypto6.randomUUID().slice(0, 8)}`,
      status: "SUCCEEDED",
      amount: amount || 0
    };
  }
};

// src/payments/payment-service.ts
import crypto7 from "node:crypto";
var PaymentService = class {
  constructor(notificationService) {
    this.providers = /* @__PURE__ */ new Map();
    this.notificationService = notificationService;
    try {
      this.providers.set("mock", new MockPaymentProvider());
    } catch {
    }
    this.providers.set("yookassa", new YooKassaPaymentProvider());
    this.providers.set("telegram", new TelegramPaymentProvider());
    this.defaultProviderName = process.env.PAYMENT_PROVIDER || "mock";
  }
  setNotificationService(service) {
    this.notificationService = service;
  }
  getProvider(name) {
    const providerName = name || this.defaultProviderName;
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new AppError(`Payment provider "${providerName}" is not available or not configured.`, 400);
    }
    return provider;
  }
  /**
   * Initialize a payment for an order
   */
  async createPayment(orderId, customReturnUrl) {
    const db = getDatabase();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) {
      throw new NotFoundError("Order", orderId);
    }
    if (order.payment_status === "PAID") {
      throw new AppError("\u0417\u0430\u043A\u0430\u0437 \u0443\u0436\u0435 \u043E\u043F\u043B\u0430\u0447\u0435\u043D.", 400);
    }
    const provider = this.getProvider(order.payment_provider || this.defaultProviderName);
    const returnUrl = customReturnUrl || `${process.env.APP_URL || ""}/order/${order.id}?status=check`;
    const input = {
      orderId: order.id,
      orderNumber: order.order_number,
      amount: order.total,
      currency: order.currency,
      description: `\u041E\u043F\u043B\u0430\u0442\u0430 \u0437\u0430\u043A\u0430\u0437\u0430 #${order.order_number} \u0432 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0435 \u043E\u0434\u0435\u0436\u0434\u044B`,
      customerPhone: order.customer_phone,
      returnUrl
    };
    const result = await provider.createPayment(input);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const paymentRecordId = `pay_${crypto7.randomUUID().slice(0, 8)}`;
    db.prepare(`
      INSERT INTO payments (id, order_id, provider, provider_payment_id, amount, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentRecordId,
      order.id,
      result.provider,
      result.providerPaymentId,
      order.total,
      order.currency,
      result.status,
      now,
      now
    );
    if (order.status === "NEW") {
      OrderStateMachine.validateTransition(order.status, "PAYMENT_PENDING");
      db.prepare(`
        UPDATE orders SET status = 'PAYMENT_PENDING', payment_id = ?, updated_at = ? WHERE id = ?
      `).run(result.providerPaymentId, now, order.id);
    } else {
      db.prepare(`
        UPDATE orders SET payment_id = ?, updated_at = ? WHERE id = ?
      `).run(result.providerPaymentId, now, order.id);
    }
    return result;
  }
  /**
   * Process incoming webhook idempotently
   */
  async processWebhook(providerName, payload, headers) {
    const provider = this.getProvider(providerName);
    const webhookResult = await provider.handleWebhook(payload, headers);
    const db = getDatabase();
    const existingEvent = db.prepare(`
      SELECT * FROM payment_events WHERE idempotency_key = ?
    `).get(webhookResult.idempotencyKey);
    if (existingEvent) {
      return {
        handled: true,
        isDuplicate: true,
        orderId: webhookResult.orderId,
        status: existingEvent.status
      };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const eventId = `pe_${crypto7.randomUUID().slice(0, 8)}`;
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(`
        INSERT INTO payment_events (
          id, order_id, provider, provider_payment_id, idempotency_key, event_type, status, amount, currency, raw_payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventId,
        webhookResult.orderId,
        webhookResult.provider,
        webhookResult.providerPaymentId,
        webhookResult.idempotencyKey,
        webhookResult.eventType,
        webhookResult.status,
        webhookResult.amount,
        webhookResult.currency,
        JSON.stringify(webhookResult.rawPayload),
        now
      );
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(webhookResult.orderId);
      if (!order) {
        db.exec("ROLLBACK;");
        throw new NotFoundError("Order", webhookResult.orderId);
      }
      db.prepare(`
        UPDATE payments SET status = ?, updated_at = ? WHERE provider_payment_id = ? OR order_id = ?
      `).run(webhookResult.status, now, webhookResult.providerPaymentId, webhookResult.orderId);
      if (webhookResult.status === "PAID" && order.payment_status !== "PAID") {
        const nextOrderStatus = "PAID";
        if (order.status !== "PAID") {
          OrderStateMachine.validateTransition(order.status, nextOrderStatus);
        }
        db.prepare(`
          UPDATE orders SET
            status = 'PAID',
            payment_status = 'PAID',
            payment_id = ?,
            updated_at = ?
          WHERE id = ?
        `).run(webhookResult.providerPaymentId, now, order.id);
      } else if (webhookResult.status === "FAILED" && order.payment_status !== "PAID") {
        db.prepare(`
          UPDATE orders SET payment_status = 'FAILED', updated_at = ? WHERE id = ?
        `).run(now, order.id);
      }
      db.exec("COMMIT;");
      if (webhookResult.status === "PAID" && order.payment_status !== "PAID" && this.notificationService) {
        const updatedOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
        this.notificationService.notifyCustomerOrderPaid(updatedOrder).catch(console.error);
        this.notificationService.notifyAdminOrderPaid(updatedOrder).catch(console.error);
      }
      return {
        handled: true,
        isDuplicate: false,
        orderId: webhookResult.orderId,
        status: webhookResult.status
      };
    } catch (err) {
      try {
        db.exec("ROLLBACK;");
      } catch {
      }
      throw err;
    }
  }
};

// src/services/admin-service.ts
var AdminService = class {
  /**
   * Dashboard key performance indicators
   */
  getDashboardStats() {
    const db = getDatabase();
    const revenueRow = db.prepare(`
      SELECT SUM(total) as revenue FROM orders WHERE payment_status = 'PAID'
    `).get();
    const ordersCountRow = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN payment_status = 'PAID' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN payment_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
      FROM orders
    `).get();
    const customersCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE role = 'CUSTOMER'
    `).get();
    const lowStockVariants = db.prepare(`
      SELECT pv.*, p.name as product_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.stock_quantity < 5 AND pv.status = 'ACTIVE'
      ORDER BY pv.stock_quantity ASC
      LIMIT 10
    `).all();
    const recentOrderRows = db.prepare(`
      SELECT * FROM orders ORDER BY created_at DESC LIMIT 5
    `).all();
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
        updatedAt: o.updated_at
      }))
    };
  }
  /**
   * Get store settings
   */
  getStoreSettings() {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM store_settings LIMIT 1").get();
    if (!row) {
      return {
        storeName: "ATELIER",
        description: "\u041F\u0440\u0435\u043C\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u0433\u0430\u0440\u0434\u0435\u0440\u043E\u0431",
        logo: "",
        currency: "RUB",
        contactTelegram: "@atelier_support",
        contactPhone: "+7 (999) 000-11-22",
        deliveryEnabled: true,
        pickupEnabled: true,
        paymentEnabled: true,
        deliveryPrice: 350,
        freeDeliveryThreshold: 5e3
      };
    }
    return {
      storeName: row.store_name,
      description: row.description || "",
      logo: row.logo || "",
      currency: row.currency || "RUB",
      contactTelegram: row.contact_telegram || "",
      contactPhone: row.contact_phone || "",
      deliveryEnabled: Boolean(row.delivery_enabled),
      pickupEnabled: Boolean(row.pickup_enabled),
      paymentEnabled: Boolean(row.payment_enabled),
      deliveryPrice: row.delivery_price,
      freeDeliveryThreshold: row.free_delivery_threshold
    };
  }
  /**
   * Update store settings
   */
  updateStoreSettings(data) {
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM store_settings LIMIT 1").get();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const storeName = data.storeName ?? existing?.store_name ?? "ATELIER";
    const description = data.description ?? existing?.description ?? "";
    const logo = data.logo ?? existing?.logo ?? "";
    const currency = data.currency ?? existing?.currency ?? "RUB";
    const contactTelegram = data.contactTelegram ?? existing?.contact_telegram ?? "";
    const contactPhone = data.contactPhone ?? existing?.contact_phone ?? "";
    const deliveryEnabled = data.deliveryEnabled !== void 0 ? data.deliveryEnabled ? 1 : 0 : existing?.delivery_enabled ?? 1;
    const pickupEnabled = data.pickupEnabled !== void 0 ? data.pickupEnabled ? 1 : 0 : existing?.pickup_enabled ?? 1;
    const paymentEnabled = data.paymentEnabled !== void 0 ? data.paymentEnabled ? 1 : 0 : existing?.payment_enabled ?? 1;
    const deliveryPrice = data.deliveryPrice ?? existing?.delivery_price ?? 350;
    const freeDeliveryThreshold = data.freeDeliveryThreshold ?? existing?.free_delivery_threshold ?? 5e3;
    if (existing) {
      db.prepare(`
        UPDATE store_settings SET
          store_name = ?, description = ?, logo = ?, currency = ?,
          contact_telegram = ?, contact_phone = ?,
          delivery_enabled = ?, pickup_enabled = ?, payment_enabled = ?,
          delivery_price = ?, free_delivery_threshold = ?, updated_at = ?
        WHERE id = ?
      `).run(
        storeName,
        description,
        logo,
        currency,
        contactTelegram,
        contactPhone,
        deliveryEnabled,
        pickupEnabled,
        paymentEnabled,
        deliveryPrice,
        freeDeliveryThreshold,
        now,
        existing.id
      );
    }
    return this.getStoreSettings();
  }
  /**
   * Get list of customers with order stats
   */
  getCustomers() {
    const db = getDatabase();
    return db.prepare(`
      SELECT u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.role, u.created_at,
             COUNT(o.id) as orders_count,
             COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN o.total ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id
      ORDER BY total_spent DESC, orders_count DESC
    `).all();
  }
  /**
   * Get all orders with filtering and search
   */
  getOrders(filters) {
    const db = getDatabase();
    const conditions = [];
    const values = [];
    if (filters?.status) {
      conditions.push("status = ?");
      values.push(filters.status);
    }
    if (filters?.paymentStatus) {
      conditions.push("payment_status = ?");
      values.push(filters.paymentStatus);
    }
    if (filters?.search) {
      conditions.push("(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)");
      const term = `%${filters.search}%`;
      values.push(term, term, term);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY created_at DESC`).all(...values);
    const getItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?");
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
      items: getItems.all(r.id),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }
  /**
   * Get recent notifications log
   */
  getNotifications() {
    const db = getDatabase();
    return db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 30").all();
  }
};

// src/telegram/telegram-auth.ts
import crypto8 from "node:crypto";
var TelegramAuth = class {
  /**
   * Validate initData string against Telegram Bot Token HMAC-SHA256
   */
  static validateInitData(initData, botToken) {
    if (!initData) {
      return { isValid: false };
    }
    try {
      const urlParams = new URLSearchParams(initData);
      const hash = urlParams.get("hash");
      if (!hash) {
        return { isValid: false };
      }
      if ((process.env.NODE_ENV !== "production" || !botToken || botToken === "your_bot_token_here") && initData.startsWith("mock_")) {
        const rawUser2 = urlParams.get("user");
        const user2 = rawUser2 ? JSON.parse(rawUser2) : void 0;
        return { isValid: true, user: user2 };
      }
      urlParams.delete("hash");
      const keys = Array.from(urlParams.keys()).sort();
      const dataCheckString = keys.map((key) => `${key}=${urlParams.get(key)}`).join("\n");
      const secretKey = crypto8.createHmac("sha256", "WebAppData").update(botToken).digest();
      const calculatedHash = crypto8.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
      const isValid = crypto8.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(hash, "hex"));
      if (!isValid) {
        return { isValid: false };
      }
      const rawUser = urlParams.get("user");
      const user = rawUser ? JSON.parse(rawUser) : void 0;
      const authDate = Number(urlParams.get("auth_date") || 0);
      const nowSeconds = Math.floor(Date.now() / 1e3);
      if (authDate > 0 && nowSeconds - authDate > 86400 * 2) {
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
  static findOrCreateUser(tgUser) {
    const db = getDatabase();
    const telegramId = String(tgUser.id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "123456789").split(",").map((id) => id.trim());
    const role = adminIds.includes(telegramId) ? "ADMIN" : "CUSTOMER";
    const existing = db.prepare("SELECT * FROM users WHERE telegram_id = ?").get(telegramId);
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
        existing.role === "ADMIN" ? "ADMIN" : role,
        now,
        telegramId
      );
      return {
        id: existing.id,
        telegramId: existing.telegram_id,
        username: tgUser.username || existing.username,
        firstName: tgUser.first_name || existing.first_name,
        lastName: tgUser.last_name || existing.last_name,
        role: existing.role === "ADMIN" ? "ADMIN" : role,
        createdAt: existing.created_at,
        updatedAt: now
      };
    }
    const userId = `user_${crypto8.randomUUID().slice(0, 8)}`;
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
      updatedAt: now
    };
  }
  /**
   * Helper to create a signed mock initData string for development/testing
   */
  static createMockInitData(user, botToken = "test_token") {
    const authDate = Math.floor(Date.now() / 1e3);
    const userJson = JSON.stringify(user);
    const params = new URLSearchParams();
    params.set("auth_date", String(authDate));
    params.set("query_id", "AAHdF60gAAAAAN0XrSC...");
    params.set("user", userJson);
    const keys = Array.from(params.keys()).sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join("\n");
    const secretKey = crypto8.createHmac("sha256", "WebAppData").update(botToken).digest();
    const hash = crypto8.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    params.set("hash", hash);
    return params.toString();
  }
};

// src/telegram/telegram-bot.ts
var TelegramBotAdapter = class {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    this.webAppUrl = process.env.TELEGRAM_WEBAPP_URL || process.env.APP_URL || "https://localhost:3000";
  }
  /**
   * Process incoming webhook update from Telegram
   */
  async handleUpdate(update) {
    if (!update) return { ok: true };
    const message = update.message;
    if (!message || !message.text) return { ok: true };
    const chatId = message.chat.id;
    const text = message.text.trim();
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const deepLink = parts[1];
      let targetUrl = this.webAppUrl;
      if (deepLink) {
        targetUrl += `?startapp=${encodeURIComponent(deepLink)}`;
      }
      await this.sendMessage(chatId, `\u{1F44B} <b>\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 \u043C\u0430\u0433\u0430\u0437\u0438\u043D ATELIER!</b>

\u0417\u0434\u0435\u0441\u044C \u0432\u044B \u043D\u0430\u0439\u0434\u0435\u0442\u0435 \u043A\u043E\u043D\u0446\u0435\u043F\u0442\u0443\u0430\u043B\u044C\u043D\u0443\u044E \u043E\u0434\u0435\u0436\u0434\u0443 \u0438 \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u0433\u0430\u0440\u0434\u0435\u0440\u043E\u0431 \u0438\u0437 \u043F\u0440\u0435\u043C\u0438\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0445\u043B\u043E\u043F\u043A\u0430.

\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435, \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u043A\u0430\u0442\u0430\u043B\u043E\u0433:`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "\u{1F6CD} \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D",
                web_app: { url: targetUrl }
              }
            ],
            [
              {
                text: "\u{1F4E6} \u041C\u043E\u0438 \u0437\u0430\u043A\u0430\u0437\u044B",
                web_app: { url: `${this.webAppUrl}?tab=orders` }
              }
            ]
          ]
        }
      });
      return { ok: true };
    }
    if (text === "/help") {
      await this.sendMessage(
        chatId,
        `\u2139\uFE0F <b>\u0421\u043F\u0440\u0430\u0432\u043A\u0430 ATELIER:</b>

\u2022 /start \u2014 \u0433\u043B\u0430\u0432\u043D\u043E\u0435 \u043C\u0435\u043D\u044E \u0438 \u0441\u0441\u044B\u043B\u043A\u0430 \u0432 \u043C\u0430\u0433\u0430\u0437\u0438\u043D
\u2022 /orders \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u0441\u0442\u0430\u0442\u0443\u0441 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0445 \u0437\u0430\u043A\u0430\u0437\u043E\u0432
\u2022 /admin \u2014 \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u044C (\u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u043E\u0432)`
      );
      return { ok: true };
    }
    if (text === "/orders") {
      const db = getDatabase();
      const user = db.prepare("SELECT id FROM users WHERE telegram_id = ?").get(String(chatId));
      if (!user) {
        await this.sendMessage(chatId, '\u0412\u044B \u0435\u0449\u0435 \u043D\u0435 \u0434\u0435\u043B\u0430\u043B\u0438 \u0437\u0430\u043A\u0430\u0437\u043E\u0432 \u0432 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0435. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D" \u0432 /start');
        return { ok: true };
      }
      const orders = db.prepare("SELECT order_number, status, total, currency FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5").all(user.id);
      if (!orders || orders.length === 0) {
        await this.sendMessage(chatId, "\u0423 \u0432\u0430\u0441 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u043D\u044B\u0445 \u0437\u0430\u043A\u0430\u0437\u043E\u0432.");
        return { ok: true };
      }
      const list = orders.map((o) => `\u2022 <b>#${o.order_number}</b>: ${o.status} (${o.total} ${o.currency})`).join("\n");
      await this.sendMessage(chatId, `\u{1F4CB} <b>\u0412\u0430\u0448\u0438 \u043D\u0435\u0434\u0430\u0432\u043D\u0438\u0435 \u0437\u0430\u043A\u0430\u0437\u044B:</b>

${list}`);
      return { ok: true };
    }
    if (text === "/admin") {
      const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "123456789").split(",").map((s) => s.trim());
      if (!adminIds.includes(String(chatId))) {
        await this.sendMessage(chatId, "\u26D4\uFE0F \u0423 \u0432\u0430\u0441 \u043D\u0435\u0442 \u043F\u0440\u0430\u0432 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430.");
        return { ok: true };
      }
      await this.sendMessage(chatId, `\u2699\uFE0F <b>\u041F\u0430\u043D\u0435\u043B\u044C \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u043E\u043C</b>

\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u0445\u043E\u0434\u0430 \u0432 \u0430\u0434\u043C\u0438\u043D\u043A\u0443:`, {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "\u{1F6E0} \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u044C",
                web_app: { url: `${this.webAppUrl}?mode=admin` }
              }
            ]
          ]
        }
      });
      return { ok: true };
    }
    return { ok: true };
  }
  async sendMessage(chatId, text, extra = {}) {
    if (!this.botToken || this.botToken === "your_bot_token_here") {
      return true;
    }
    try {
      const body = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...extra
      };
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return res.ok;
    } catch {
      return false;
    }
  }
};

// src/telegram/notification-service.ts
import crypto9 from "node:crypto";
var NotificationService = class {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    this.adminTelegramIds = (process.env.ADMIN_TELEGRAM_IDS || "123456789").split(",").map((s) => s.trim()).filter(Boolean);
  }
  /**
   * Send telegram message or record to database notifications log
   */
  async sendTelegramMessage(chatId, text) {
    const db = getDatabase();
    const id = `notif_${crypto9.randomUUID().slice(0, 8)}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO notifications (id, recipient_type, recipient_telegram_id, title, message, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      this.adminTelegramIds.includes(chatId) ? "ADMIN" : "CUSTOMER",
      chatId,
      "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0435 Telegram",
      text,
      "SENT",
      now
    );
    if (this.botToken && this.botToken !== "your_bot_token_here") {
      try {
        const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML"
          })
        });
        const data = await res.json();
        return data.ok;
      } catch (err) {
        console.error("Failed to send Telegram message:", err);
        return false;
      }
    }
    return true;
  }
  /**
   * Notify Admin about a newly created order
   */
  async notifyAdminNewOrder(order) {
    const db = getDatabase();
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
    const itemsSummary = items.map((item) => `\u2022 ${item.product_name_snapshot} (${item.variant_name_snapshot}) \xD7 ${item.quantity} \u0448\u0442. = ${item.total_price} ${order.currency}`).join("\n");
    const deliveryMethodText = order.deliveryMethod === "DELIVERY" ? `\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430 \u043A\u0443\u0440\u044C\u0435\u0440\u043E\u043C (${order.deliveryAddress || "\u0430\u0434\u0440\u0435\u0441 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D"})` : "\u0421\u0430\u043C\u043E\u0432\u044B\u0432\u043E\u0437 \u0438\u0437 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430";
    const text = `\u{1F6CD} <b>\u041D\u043E\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 #${order.orderNumber}</b>

<b>\u041F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044C:</b> ${order.customerName}
<b>\u0422\u0435\u043B\u0435\u0444\u043E\u043D:</b> ${order.customerPhone}
${order.customerUsername ? `<b>Telegram:</b> @${order.customerUsername}
` : ""}<b>\u0421\u043F\u043E\u0441\u043E\u0431 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F:</b> ${deliveryMethodText}
<b>\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u043F\u043B\u0430\u0442\u044B:</b> ${order.paymentStatus}

<b>\u0422\u043E\u0432\u0430\u0440\u044B:</b>
${itemsSummary}

<b>\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430:</b> ${order.deliveryPrice} ${order.currency}
<b>\u0418\u0442\u043E\u0433\u043E \u043A \u043E\u043F\u043B\u0430\u0442\u0435:</b> ${order.total} ${order.currency}
${order.comment ? `
<i>\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439: ${order.comment}</i>` : ""}`;
    for (const adminId of this.adminTelegramIds) {
      await this.sendTelegramMessage(adminId, text);
    }
  }
  /**
   * Notify Customer that order was successfully paid
   */
  async notifyCustomerOrderPaid(order) {
    const db = getDatabase();
    const userId = order.userId || order.user_id;
    if (!userId) return;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user || !user.telegram_id) return;
    const orderNumber = order.orderNumber || order.order_number;
    const currency = order.currency || "RUB";
    const text = `\u2705 <b>\u0417\u0430\u043A\u0430\u0437 #${orderNumber} \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u043E\u043F\u043B\u0430\u0447\u0435\u043D!</b>

\u0421\u0443\u043C\u043C\u0430: <b>${order.total} ${currency}</b>
\u041C\u044B \u0443\u0436\u0435 \u043D\u0430\u0447\u0430\u043B\u0438 \u0441\u043E\u0431\u0438\u0440\u0430\u0442\u044C \u0432\u0430\u0448 \u0437\u0430\u043A\u0430\u0437. \u0412\u044B \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u043A\u043E\u0433\u0434\u0430 \u0441\u0442\u0430\u0442\u0443\u0441 \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u0441\u044F.

\u0421\u043F\u0430\u0441\u0438\u0431\u043E \u0437\u0430 \u043F\u043E\u043A\u0443\u043F\u043A\u0443 \u0432 ATELIER!`;
    await this.sendTelegramMessage(user.telegram_id, text);
  }
  /**
   * Notify Admin that payment was confirmed
   */
  async notifyAdminOrderPaid(order) {
    const orderNumber = order.orderNumber || order.order_number;
    const customerName = order.customerName || order.customer_name;
    const customerPhone = order.customerPhone || order.customer_phone;
    const currency = order.currency || "RUB";
    const text = `\u{1F4B0} <b>\u0417\u0430\u043A\u0430\u0437 #${orderNumber} \u043E\u043F\u043B\u0430\u0447\u0435\u043D!</b>

\u0421\u0443\u043C\u043C\u0430: ${order.total} ${currency}
\u041F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044C: ${customerName} (${customerPhone})
\u0421\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u043A\u0430\u0437\u0430: ${order.status}`;
    for (const adminId of this.adminTelegramIds) {
      await this.sendTelegramMessage(adminId, text);
    }
  }
  /**
   * Notify Customer about order status updates
   */
  async notifyCustomerStatusChange(order, oldStatus, newStatus) {
    const db = getDatabase();
    const userId = order.userId || order.user_id;
    if (!userId) return;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    if (!user || !user.telegram_id) return;
    const orderNumber = order.orderNumber || order.order_number;
    const deliveryMethod = order.deliveryMethod || order.delivery_method;
    const statusDescriptions = {
      NEW: "\u0441\u043E\u0437\u0434\u0430\u043D",
      PAYMENT_PENDING: "\u043E\u0436\u0438\u0434\u0430\u0435\u0442 \u043E\u043F\u043B\u0430\u0442\u044B",
      PAID: "\u043E\u043F\u043B\u0430\u0447\u0435\u043D",
      PROCESSING: "\u043F\u0440\u0438\u043D\u044F\u0442 \u0432 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0443 \u0438 \u043A\u043E\u043C\u043F\u043B\u0435\u043A\u0442\u0443\u0435\u0442\u0441\u044F",
      READY: deliveryMethod === "PICKUP" ? "\u0433\u043E\u0442\u043E\u0432 \u043A \u0441\u0430\u043C\u043E\u0432\u044B\u0432\u043E\u0437\u0443" : "\u043F\u0435\u0440\u0435\u0434\u0430\u043D \u043A\u0443\u0440\u044C\u0435\u0440\u0443 \u0434\u043B\u044F \u0434\u043E\u0441\u0442\u0430\u0432\u043A\u0438",
      COMPLETED: "\u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D. \u0421\u043F\u0430\u0441\u0438\u0431\u043E, \u0447\u0442\u043E \u0432\u044B \u0441 \u043D\u0430\u043C\u0438!",
      CANCELLED: "\u043E\u0442\u043C\u0435\u043D\u0435\u043D",
      REFUNDED: "\u0432\u043E\u0437\u0432\u0440\u0430\u0449\u0435\u043D"
    };
    const text = `\u{1F4E6} <b>\u0421\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u043A\u0430\u0437\u0430 #${orderNumber} \u043E\u0431\u043D\u043E\u0432\u043B\u0435\u043D:</b>

\u041D\u043E\u0432\u044B\u0439 \u0441\u0442\u0430\u0442\u0443\u0441: <b>${statusDescriptions[newStatus] || newStatus}</b>
${newStatus === "READY" && deliveryMethod === "PICKUP" ? "\n\u0410\u0434\u0440\u0435\u0441 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430: \u0443\u043B. \u0411\u043E\u043B\u044C\u0448\u0430\u044F \u041A\u043E\u043D\u044E\u0448\u0435\u043D\u043D\u0430\u044F, 12, \u0435\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u043E \u0441 10:00 \u0434\u043E 22:00." : ""}`;
    await this.sendTelegramMessage(user.telegram_id, text);
  }
};

// src/api/routes.ts
function createApiRouter() {
  const router = Router();
  const catalogService = new CatalogService();
  const cartService = new CartService();
  const notificationService = new NotificationService();
  const paymentService = new PaymentService(notificationService);
  const orderService = new OrderService(cartService, notificationService);
  const adminService = new AdminService();
  const botAdapter = new TelegramBotAdapter();
  const authMiddleware = (req, res, next) => {
    try {
      const initData = req.headers["x-telegram-init-data"];
      const customUserId = req.headers["x-user-id"];
      if (initData) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
        const validation = TelegramAuth.validateInitData(initData, botToken);
        if (validation.isValid && validation.user) {
          req.user = TelegramAuth.findOrCreateUser(validation.user);
          return next();
        }
      }
      if (customUserId) {
        const db = getDatabase();
        const userRow = db.prepare("SELECT * FROM users WHERE id = ? OR telegram_id = ?").get(customUserId, customUserId);
        if (userRow) {
          req.user = {
            id: userRow.id,
            telegramId: userRow.telegram_id,
            username: userRow.username,
            firstName: userRow.first_name,
            lastName: userRow.last_name,
            role: userRow.role,
            createdAt: userRow.created_at,
            updatedAt: userRow.updated_at
          };
          return next();
        }
      }
      if (process.env.NODE_ENV !== "production") {
        const db = getDatabase();
        const demoUser = db.prepare("SELECT * FROM users WHERE role = ? LIMIT 1").get("CUSTOMER");
        if (demoUser) {
          req.user = {
            id: demoUser.id,
            telegramId: demoUser.telegram_id,
            username: demoUser.username,
            firstName: demoUser.first_name,
            lastName: demoUser.last_name,
            role: demoUser.role,
            createdAt: demoUser.created_at,
            updatedAt: demoUser.updated_at
          };
          return next();
        }
      }
      throw new UnauthorizedError("\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0443\u0439\u0442\u0435\u0441\u044C \u0447\u0435\u0440\u0435\u0437 Telegram.");
    } catch (err) {
      next(err);
    }
  };
  const adminGuard = (req, res, next) => {
    if (!req.user || req.user.role !== "ADMIN") {
      return next(new ForbiddenError("\u0414\u043E\u0441\u0442\u0443\u043F \u043A \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043D\u043E\u0439 \u043F\u0430\u043D\u0435\u043B\u0438 \u0440\u0430\u0437\u0440\u0435\u0448\u0451\u043D \u0442\u043E\u043B\u044C\u043A\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430\u043C."));
    }
    next();
  };
  router.get("/store", (req, res, next) => {
    try {
      const settings = adminService.getStoreSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });
  router.get("/categories", (req, res, next) => {
    try {
      const categories = catalogService.getCategories();
      res.json(categories);
    } catch (err) {
      next(err);
    }
  });
  router.get("/products", (req, res, next) => {
    try {
      const { categoryId, search } = req.query;
      const products = catalogService.getProducts({
        categoryId,
        search
      });
      res.json(products);
    } catch (err) {
      next(err);
    }
  });
  router.get("/products/:id", (req, res, next) => {
    try {
      const product = catalogService.getProductById(req.params.id);
      res.json(product);
    } catch (err) {
      next(err);
    }
  });
  router.post("/auth/telegram", (req, res, next) => {
    try {
      const { initData, mockUser } = req.body;
      const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
      if (mockUser && process.env.NODE_ENV !== "production") {
        const user2 = TelegramAuth.findOrCreateUser(mockUser);
        return res.json({ user: user2, token: user2.id });
      }
      if (!initData) {
        throw new AppError("Missing Telegram initData", 400);
      }
      const result = TelegramAuth.validateInitData(initData, botToken);
      if (!result.isValid || !result.user) {
        throw new UnauthorizedError("\u041D\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u0434\u0430\u043D\u043D\u044B\u0445 Telegram");
      }
      const user = TelegramAuth.findOrCreateUser(result.user);
      res.json({ user, token: user.id });
    } catch (err) {
      next(err);
    }
  });
  router.get("/auth/me", authMiddleware, (req, res) => {
    res.json(req.user);
  });
  router.get("/cart", authMiddleware, (req, res, next) => {
    try {
      const cart = cartService.getOrCreateCart(req.user.id);
      res.json(cart);
    } catch (err) {
      next(err);
    }
  });
  router.post("/cart", authMiddleware, (req, res, next) => {
    try {
      const { productId, variantId, quantity } = req.body;
      const cart = cartService.addItem(req.user.id, productId, variantId, quantity || 1);
      res.json(cart);
    } catch (err) {
      next(err);
    }
  });
  router.put("/cart/items/:id", authMiddleware, (req, res, next) => {
    try {
      const { quantity } = req.body;
      const cart = cartService.updateItemQuantity(req.user.id, req.params.id, Number(quantity));
      res.json(cart);
    } catch (err) {
      next(err);
    }
  });
  router.delete("/cart/items/:id", authMiddleware, (req, res, next) => {
    try {
      const cart = cartService.removeItem(req.user.id, req.params.id);
      res.json(cart);
    } catch (err) {
      next(err);
    }
  });
  router.delete("/cart", authMiddleware, (req, res, next) => {
    try {
      cartService.clearCart(req.user.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });
  router.post("/orders", authMiddleware, async (req, res, next) => {
    try {
      const { customerName, customerPhone, customerUsername, deliveryMethod, deliveryAddress, comment, paymentProvider } = req.body;
      const order = await orderService.createOrder({
        userId: req.user.id,
        customerName,
        customerPhone,
        customerUsername: customerUsername || req.user.username,
        deliveryMethod: deliveryMethod || "DELIVERY",
        deliveryAddress,
        comment,
        paymentProvider
      });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  });
  router.get("/orders", authMiddleware, (req, res, next) => {
    try {
      const orders = orderService.getUserOrders(req.user.id);
      res.json(orders);
    } catch (err) {
      next(err);
    }
  });
  router.get("/orders/:id", authMiddleware, (req, res, next) => {
    try {
      const order = orderService.getOrderById(req.params.id, req.user);
      res.json(order);
    } catch (err) {
      next(err);
    }
  });
  router.post("/orders/:id/payment", authMiddleware, async (req, res, next) => {
    try {
      orderService.getOrderById(req.params.id, req.user);
      const paymentResult = await paymentService.createPayment(req.params.id, req.body.returnUrl);
      res.json(paymentResult);
    } catch (err) {
      next(err);
    }
  });
  router.post("/payments/webhook", async (req, res, next) => {
    try {
      const provider = req.query.provider || req.body.provider || "mock";
      const result = await paymentService.processWebhook(provider, req.body, req.headers);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
  router.post("/payments/mock-simulate", async (req, res, next) => {
    try {
      const { orderId, providerPaymentId, status, isDuplicate } = req.body;
      const idempotencyKey = isDuplicate ? `mock_evt_${providerPaymentId || orderId}_first` : `mock_evt_${providerPaymentId || orderId}_${Date.now()}`;
      const result = await paymentService.processWebhook("mock", {
        providerPaymentId: providerPaymentId || `mock_sim_${Date.now()}`,
        orderId,
        idempotencyKey,
        status: status || "PAID",
        amount: req.body.amount || 0,
        currency: "RUB",
        eventType: status === "PAID" ? "payment.succeeded" : "payment.failed"
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
  router.post("/telegram/webhook", async (req, res, next) => {
    try {
      const result = await botAdapter.handleUpdate(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
  router.get("/admin/dashboard", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const stats = adminService.getDashboardStats();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  });
  router.get("/admin/products", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const products = catalogService.getProducts({ status: req.query.status });
      res.json(products);
    } catch (err) {
      next(err);
    }
  });
  router.post("/admin/products", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const created = catalogService.createProduct(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });
  router.put("/admin/products/:id", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const updated = catalogService.updateProduct(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });
  router.delete("/admin/products/:id", authMiddleware, adminGuard, (req, res, next) => {
    try {
      catalogService.deleteProduct(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });
  router.post("/admin/categories", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const category = catalogService.createCategory(req.body);
      res.status(201).json(category);
    } catch (err) {
      next(err);
    }
  });
  router.put("/admin/categories/:id", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const category = catalogService.updateCategory(req.params.id, req.body);
      res.json(category);
    } catch (err) {
      next(err);
    }
  });
  router.delete("/admin/categories/:id", authMiddleware, adminGuard, (req, res, next) => {
    try {
      catalogService.deleteCategory(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });
  router.get("/admin/orders", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const orders = adminService.getOrders({
        status: req.query.status,
        paymentStatus: req.query.paymentStatus,
        search: req.query.search
      });
      res.json(orders);
    } catch (err) {
      next(err);
    }
  });
  router.get("/admin/orders/:id", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const order = orderService.getOrderById(req.params.id, req.user);
      res.json(order);
    } catch (err) {
      next(err);
    }
  });
  router.put("/admin/orders/:id/status", authMiddleware, adminGuard, async (req, res, next) => {
    try {
      const { status } = req.body;
      const order = await orderService.updateOrderStatus(req.params.id, status, req.user);
      res.json(order);
    } catch (err) {
      next(err);
    }
  });
  router.get("/admin/customers", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const customers = adminService.getCustomers();
      res.json(customers);
    } catch (err) {
      next(err);
    }
  });
  router.get("/admin/settings", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const settings = adminService.getStoreSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });
  router.put("/admin/settings", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const updated = adminService.updateStoreSettings(req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });
  router.get("/admin/notifications", authMiddleware, adminGuard, (req, res, next) => {
    try {
      const notifications = adminService.getNotifications();
      res.json(notifications);
    } catch (err) {
      next(err);
    }
  });
  router.use((err, req, res, next) => {
    const statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({
      error: {
        code: err.code || "INTERNAL_SERVER_ERROR",
        message
      }
    });
  });
  return router;
}

// src/database/seed.ts
function seedDatabase(db) {
  const database = db || getDatabase();
  const check = database.prepare("SELECT COUNT(*) as count FROM store_settings").get();
  if (check && check.count > 0) {
    return;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  database.prepare(`
    INSERT INTO store_settings (
      id, store_name, description, logo, currency, contact_telegram, contact_phone,
      delivery_enabled, pickup_enabled, payment_enabled, delivery_price, free_delivery_threshold,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "store_main",
    "ATELIER / Minimalist Apparel",
    "\u041F\u0440\u0435\u043C\u0438\u0430\u043B\u044C\u043D\u044B\u0439 \u0431\u0430\u0437\u043E\u0432\u044B\u0439 \u0433\u0430\u0440\u0434\u0435\u0440\u043E\u0431 \u0438 \u043A\u043E\u043D\u0446\u0435\u043F\u0442\u0443\u0430\u043B\u044C\u043D\u044B\u0439 streetwear \u0432 Telegram.",
    "",
    "RUB",
    "@atelier_support",
    "+7 (999) 000-11-22",
    1,
    1,
    1,
    350,
    5e3,
    now,
    now
  );
  database.prepare(`
    INSERT INTO users (id, telegram_id, username, first_name, last_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run("user_admin_1", "123456789", "admin_seller", "\u041A\u043E\u043D\u0441\u0442\u0430\u043D\u0442\u0438\u043D", "\u0410\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440", "ADMIN", now, now);
  database.prepare(`
    INSERT INTO users (id, telegram_id, username, first_name, last_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run("user_buyer_1", "999888777", "alex_buyer", "\u0410\u043B\u0435\u043A\u0441\u0430\u043D\u0434\u0440", "\u041F\u043E\u043A\u0443\u043F\u0430\u0442\u0435\u043B\u044C", "CUSTOMER", now, now);
  const categories = [
    {
      id: "cat_tshirts",
      name: "\u0424\u0443\u0442\u0431\u043E\u043B\u043A\u0438",
      slug: "t-shirts",
      description: "\u041F\u043B\u043E\u0442\u043D\u044B\u0439 \u043E\u0440\u0433\u0430\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0445\u043B\u043E\u043F\u043E\u043A 240\u0433/\u043C\xB2, \u043F\u0440\u044F\u043C\u043E\u0439 \u043A\u0440\u043E\u0439 \u0438 \u043E\u0432\u0435\u0440\u0441\u0430\u0439\u0437 \u043F\u043E\u0441\u0430\u0434\u043A\u0430.",
      image: "/src/assets/images/oversized_tee_1790542603531.jpg",
      sortOrder: 1
    },
    {
      id: "cat_hoodies",
      name: "\u0425\u0443\u0434\u0438 \u0438 \u0442\u043E\u043B\u0441\u0442\u043E\u0432\u043A\u0438",
      slug: "hoodies",
      description: "\u0423\u0442\u0435\u043F\u043B\u0435\u043D\u043D\u044B\u0439 \u0444\u0443\u0442\u0435\u0440 \u0441 \u043D\u0430\u0447\u0435\u0441\u043E\u043C 450\u0433/\u043C\xB2, \u0434\u0432\u043E\u0439\u043D\u043E\u0439 \u043A\u0430\u043F\u044E\u0448\u043E\u043D \u0438 \u0441\u043F\u0443\u0449\u0435\u043D\u043D\u0430\u044F \u043B\u0438\u043D\u0438\u044F \u043F\u043B\u0435\u0447.",
      image: "/src/assets/images/hoodie_essential_1790542614014.jpg",
      sortOrder: 2
    },
    {
      id: "cat_pants",
      name: "\u0411\u0440\u044E\u043A\u0438 \u0438 \u043A\u0430\u0440\u0433\u043E",
      slug: "pants",
      description: "\u0421\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0439 \u0441\u0438\u043B\u0443\u044D\u0442, \u043F\u0440\u043E\u0447\u043D\u044B\u0439 \u0445\u043B\u043E\u043F\u043A\u043E\u0432\u044B\u0439 \u0442\u0432\u0438\u043B \u0438 \u0444\u0443\u043D\u043A\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0435 \u043A\u0430\u0440\u043C\u0430\u043D\u044B.",
      image: "/src/assets/images/cargo_pants_1790542626069.jpg",
      sortOrder: 3
    },
    {
      id: "cat_accessories",
      name: "\u0410\u043A\u0441\u0435\u0441\u0441\u0443\u0430\u0440\u044B",
      slug: "accessories",
      description: "\u0428\u0430\u043F\u043A\u0438 \u0438\u0437 \u043C\u0435\u0440\u0438\u043D\u043E\u0441\u043E\u0432\u043E\u0439 \u0448\u0435\u0440\u0441\u0442\u0438, \u0441\u0443\u043C\u043A\u0438-\u0442\u043E\u0443\u0442\u044B \u0438 \u0431\u0430\u0437\u043E\u0432\u044B\u0435 \u0434\u0435\u0442\u0430\u043B\u0438.",
      image: "/src/assets/images/minimal_beanie_1790542635742.jpg",
      sortOrder: 4
    }
  ];
  const insertCategory = database.prepare(`
    INSERT INTO categories (id, name, slug, description, image, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const cat of categories) {
    insertCategory.run(cat.id, cat.name, cat.slug, cat.description, cat.image, cat.sortOrder, 1, now, now);
  }
  const products = [
    {
      id: "prod_tee_heavy_black",
      name: "\u0424\u0443\u0442\u0431\u043E\u043B\u043A\u0430 Heavyweight Oversize Black",
      slug: "heavyweight-oversize-black",
      description: "\u0424\u043B\u0430\u0433\u043C\u0430\u043D\u0441\u043A\u0430\u044F \u0444\u0443\u0442\u0431\u043E\u043B\u043A\u0430 \u0438\u0437 \u0441\u0443\u043F\u0435\u0440\u043F\u043B\u043E\u0442\u043D\u043E\u0433\u043E \u0445\u043B\u043E\u043F\u043A\u0430 260\u0433/\u043C\xB2. \u0424\u0430\u043A\u0442\u0443\u0440\u043D\u043E\u0435 \u043F\u043E\u043B\u043E\u0442\u043D\u043E \u0434\u0435\u0440\u0436\u0438\u0442 \u0444\u043E\u0440\u043C\u0443, \u0443\u0441\u0438\u043B\u0435\u043D\u043D\u044B\u0439 \u0432\u043E\u0440\u043E\u0442 \u043D\u0435 \u0440\u0430\u0441\u0442\u044F\u0433\u0438\u0432\u0430\u0435\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0441\u0442\u0438\u0440\u043E\u043A. \u0424\u0438\u0440\u043C\u0435\u043D\u043D\u044B\u0439 \u043E\u0431\u044A\u0435\u043C\u043D\u044B\u0439 \u043A\u0440\u043E\u0439.",
      price: 2800,
      currency: "RUB",
      categoryId: "cat_tshirts",
      images: JSON.stringify(["/src/assets/images/oversized_tee_1790542603531.jpg"]),
      variants: [
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 S", size: "S", sku: "TEE-BLK-S", stock: 12 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 M", size: "M", sku: "TEE-BLK-M", stock: 18 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 L", size: "L", sku: "TEE-BLK-L", stock: 15 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 XL", size: "XL", sku: "TEE-BLK-XL", stock: 8 }
      ]
    },
    {
      id: "prod_tee_boxy_cream",
      name: "\u0424\u0443\u0442\u0431\u043E\u043B\u043A\u0430 Boxy Cut Raw Cream",
      slug: "boxy-cut-raw-cream",
      description: "\u0423\u043A\u043E\u0440\u043E\u0447\u0435\u043D\u043D\u044B\u0439 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0439 \u0441\u0438\u043B\u0443\u044D\u0442 boxy fit \u0432 \u043D\u0430\u0442\u0443\u0440\u0430\u043B\u044C\u043D\u043E\u043C \u043D\u0435\u0432\u044B\u0431\u0435\u043B\u0435\u043D\u043D\u043E\u043C \u043E\u0442\u0442\u0435\u043D\u043A\u0435 \u044D\u043A\u0440\u044E. \u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0441\u0440\u0435\u0437\u044B, \u043F\u043B\u043E\u0442\u043D\u044B\u0439 \u0433\u0440\u0435\u0431\u0435\u043D\u043D\u043E\u0439 \u0445\u043B\u043E\u043F\u043E\u043A 230\u0433/\u043C\xB2.",
      price: 2900,
      currency: "RUB",
      categoryId: "cat_tshirts",
      images: JSON.stringify(["/src/assets/images/oversized_tee_1790542603531.jpg"]),
      variants: [
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 S", size: "S", sku: "TEE-CRM-S", stock: 10 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 M", size: "M", sku: "TEE-CRM-M", stock: 14 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 L", size: "L", sku: "TEE-CRM-L", stock: 11 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 XL", size: "XL", sku: "TEE-CRM-XL", stock: 5 }
      ]
    },
    {
      id: "prod_hoodie_washed_charcoal",
      name: "\u0425\u0443\u0434\u0438 Essential Washed Charcoal",
      slug: "essential-washed-charcoal",
      description: "\u0422\u044F\u0436\u0435\u043B\u044B\u0439 \u0442\u0440\u0435\u0445\u043D\u0438\u0442\u043E\u0447\u043D\u044B\u0439 \u0444\u0443\u0442\u0435\u0440 460\u0433/\u043C\xB2 \u0441 \u043C\u044F\u0433\u043A\u0438\u043C \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0438\u043C \u043D\u0430\u0447\u0435\u0441\u043E\u043C. \u0412\u0438\u043D\u0442\u0430\u0436\u043D\u0430\u044F \u0432\u0430\u0440\u043A\u0430 garment dye \u0441 \u0431\u043B\u0430\u0433\u043E\u0440\u043E\u0434\u043D\u044B\u043C \u0433\u0440\u0430\u0444\u0438\u0442\u043E\u0432\u044B\u043C \u043E\u0442\u043B\u0438\u0432\u043E\u043C. \u0413\u043B\u0443\u0431\u043E\u043A\u0438\u0439 \u0430\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043A\u0430\u043F\u044E\u0448\u043E\u043D.",
      price: 5900,
      currency: "RUB",
      categoryId: "cat_hoodies",
      images: JSON.stringify(["/src/assets/images/hoodie_essential_1790542614014.jpg"]),
      variants: [
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 S", size: "S", sku: "HD-CHR-S", stock: 8 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 M", size: "M", sku: "HD-CHR-M", stock: 14 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 L", size: "L", sku: "HD-CHR-L", stock: 10 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 XL", size: "XL", sku: "HD-CHR-XL", stock: 6 }
      ]
    },
    {
      id: "prod_hoodie_zip_grey",
      name: "\u0417\u0438\u043F-\u0445\u0443\u0434\u0438 Architectural Grey",
      slug: "architectural-zip-grey",
      description: "\u041C\u0438\u043D\u0438\u043C\u0430\u043B\u0438\u0441\u0442\u0438\u0447\u043D\u043E\u0435 \u0445\u0443\u0434\u0438 \u043D\u0430 \u043C\u0430\u0441\u0441\u0438\u0432\u043D\u043E\u0439 \u043C\u0435\u0442\u0430\u043B\u043B\u0438\u0447\u0435\u0441\u043A\u043E\u0439 \u043C\u043E\u043B\u043D\u0438\u0438 YKK \u0441 \u0434\u0432\u0443\u043C\u044F \u0431\u0435\u0433\u0443\u043D\u043A\u0430\u043C\u0438. \u041F\u043B\u043E\u0442\u043D\u0430\u044F \u0442\u0443\u0440\u0435\u0446\u043A\u0430\u044F \u0445\u043B\u043E\u043F\u043A\u043E\u0432\u0430\u044F \u043F\u0440\u044F\u0436\u0430, \u043C\u0438\u043D\u0438\u043C\u0430\u043B\u0438\u0441\u0442\u0438\u0447\u043D\u044B\u0435 \u0441\u043A\u0440\u044B\u0442\u044B\u0435 \u043A\u0430\u0440\u043C\u0430\u043D\u044B \u0432 \u0431\u043E\u043A\u043E\u0432\u044B\u0445 \u0448\u0432\u0430\u0445.",
      price: 6400,
      currency: "RUB",
      categoryId: "cat_hoodies",
      images: JSON.stringify(["/src/assets/images/hoodie_essential_1790542614014.jpg"]),
      variants: [
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 S", size: "S", sku: "ZIP-GRY-S", stock: 6 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 M", size: "M", sku: "ZIP-GRY-M", stock: 10 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 L", size: "L", sku: "ZIP-GRY-L", stock: 8 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 XL", size: "XL", sku: "ZIP-GRY-XL", stock: 4 }
      ]
    },
    {
      id: "prod_pants_cargo_olive",
      name: "\u0411\u0440\u044E\u043A\u0438 Utility Relaxed Cargo Olive",
      slug: "utility-relaxed-cargo-olive",
      description: "\u0428\u0438\u0440\u043E\u043A\u0438\u0435 \u043A\u0430\u0440\u0433\u043E \u0438\u0437 \u043F\u0440\u043E\u0447\u043D\u043E\u0433\u043E \u0440\u0438\u043F\u0441\u0442\u043E\u043F\u0430 \u0441 \u0432\u043E\u0434\u043E\u043E\u0442\u0442\u0430\u043B\u043A\u0438\u0432\u0430\u044E\u0449\u0435\u0439 \u043F\u0440\u043E\u043F\u0438\u0442\u043A\u043E\u0439. \u0410\u043D\u0430\u0442\u043E\u043C\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0441\u043A\u043B\u0430\u0434\u043A\u0438 \u043D\u0430 \u043A\u043E\u043B\u0435\u043D\u044F\u0445, \u043A\u0443\u043B\u0438\u0441\u043A\u0438 \u043F\u043E \u043D\u0438\u0437\u0443 \u0431\u0440\u044E\u0447\u0438\u043D \u0434\u043B\u044F \u0440\u0435\u0433\u0443\u043B\u0438\u0440\u043E\u0432\u043A\u0438 \u043F\u043E\u0441\u0430\u0434\u043A\u0438.",
      price: 5200,
      currency: "RUB",
      categoryId: "cat_pants",
      images: JSON.stringify(["/src/assets/images/cargo_pants_1790542626069.jpg"]),
      variants: [
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 S", size: "S", sku: "CRG-OLV-S", stock: 7 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 M", size: "M", sku: "CRG-OLV-M", stock: 12 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 L", size: "L", sku: "CRG-OLV-L", stock: 9 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 XL", size: "XL", sku: "CRG-OLV-XL", stock: 3 }
      ]
    },
    {
      id: "prod_pants_wide_black",
      name: "\u0411\u0440\u044E\u043A\u0438 Wide Pleated Minimalist Black",
      slug: "wide-pleated-black",
      description: "\u042D\u043B\u0435\u0433\u0430\u043D\u0442\u043D\u044B\u0435 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u044B\u0435 \u0431\u0440\u044E\u043A\u0438 \u0441\u043E \u0441\u043A\u043B\u0430\u0434\u043A\u0430\u043C\u0438 \u0443 \u043F\u043E\u044F\u0441\u0430. \u0421\u043C\u0435\u0441\u043E\u0432\u0430\u044F \u0442\u043A\u0430\u043D\u044C \u0441 \u0448\u0435\u0440\u0441\u0442\u044C\u044E \u043F\u0440\u0435\u043C\u0438\u0443\u043C-\u043A\u043B\u0430\u0441\u0441\u0430, \u043C\u044F\u0433\u043A\u0430\u044F \u0434\u0440\u0430\u043F\u0438\u0440\u043E\u0432\u043A\u0430 \u0438 \u043A\u043E\u043C\u0444\u043E\u0440\u0442\u043D\u0430\u044F \u043F\u043E\u043B\u0443\u044D\u043B\u0430\u0441\u0442\u0438\u0447\u043D\u0430\u044F \u0440\u0435\u0437\u0438\u043D\u043A\u0430 \u0441\u0437\u0430\u0434\u0438.",
      price: 4900,
      currency: "RUB",
      categoryId: "cat_pants",
      images: JSON.stringify(["/src/assets/images/cargo_pants_1790542626069.jpg"]),
      variants: [
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 S", size: "S", sku: "PLT-BLK-S", stock: 9 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 M", size: "M", sku: "PLT-BLK-M", stock: 15 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 L", size: "L", sku: "PLT-BLK-L", stock: 11 },
        { name: "\u0420\u0430\u0437\u043C\u0435\u0440 XL", size: "XL", sku: "PLT-BLK-XL", stock: 5 }
      ]
    },
    {
      id: "prod_acc_merino_beanie",
      name: "\u0428\u0430\u043F\u043A\u0430 Ribbed Merino Wool Beanie",
      slug: "ribbed-merino-beanie",
      description: "100% \u0442\u043E\u043D\u043A\u043E\u0440\u0443\u043D\u043D\u0430\u044F \u043C\u0435\u0440\u0438\u043D\u043E\u0441\u043E\u0432\u0430\u044F \u0448\u0435\u0440\u0441\u0442\u044C extra fine. \u0410\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0430\u044F \u0444\u0430\u043A\u0442\u0443\u0440\u043D\u0430\u044F \u0440\u0435\u0437\u0438\u043D\u043A\u0430, \u043F\u043B\u043E\u0442\u043D\u0430\u044F \u043F\u043E\u0441\u0430\u0434\u043A\u0430, \u043D\u0435 \u043A\u043E\u043B\u0435\u0442\u0441\u044F \u0438 \u043E\u0442\u043B\u0438\u0447\u043D\u043E \u0434\u0435\u0440\u0436\u0438\u0442 \u0442\u0435\u043F\u043B\u043E.",
      price: 1900,
      currency: "RUB",
      categoryId: "cat_accessories",
      images: JSON.stringify(["/src/assets/images/minimal_beanie_1790542635742.jpg"]),
      variants: [
        { name: "ONE SIZE (\u0423\u043D\u0438\u0432\u0435\u0440\u0441\u0430\u043B\u044C\u043D\u044B\u0439)", size: "ONE SIZE", sku: "ACC-BN-BLK", stock: 25 }
      ]
    },
    {
      id: "prod_acc_canvas_tote",
      name: "\u0421\u0443\u043C\u043A\u0430-\u0442\u043E\u0443\u0442 Heavyweight Canvas Tote",
      slug: "canvas-tote-natural",
      description: "\u0412\u043C\u0435\u0441\u0442\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0442\u043E\u0443\u0442 \u0438\u0437 \u043F\u043B\u043E\u0442\u043D\u043E\u0433\u043E \u043F\u0430\u0440\u0443\u0441\u0438\u043D\u043E\u0432\u043E\u0433\u043E \u043A\u0430\u043D\u0432\u0430\u0441\u0430 400\u0433/\u043C\xB2. \u0414\u0432\u043E\u0439\u043D\u044B\u0435 \u043F\u0440\u043E\u0448\u0438\u0442\u044B\u0435 \u0440\u0443\u0447\u043A\u0438, \u0432\u043D\u0443\u0442\u0440\u0435\u043D\u043D\u0438\u0439 \u043A\u0430\u0440\u043C\u0430\u043D \u043D\u0430 \u043C\u043E\u043B\u043D\u0438\u0438 \u0434\u043B\u044F \u043A\u043B\u044E\u0447\u0435\u0439 \u0438 \u0441\u043C\u0430\u0440\u0442\u0444\u043E\u043D\u0430.",
      price: 2400,
      currency: "RUB",
      categoryId: "cat_accessories",
      images: JSON.stringify(["/src/assets/images/minimal_beanie_1790542635742.jpg"]),
      variants: [
        { name: "ONE SIZE (\u0412\u043C\u0435\u0441\u0442\u0438\u043C\u043E\u0441\u0442\u044C 22L)", size: "ONE SIZE", sku: "ACC-TOT-NAT", stock: 20 }
      ]
    }
  ];
  const insertProduct = database.prepare(`
    INSERT INTO products (id, name, slug, description, price, currency, category_id, images, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertVariant = database.prepare(`
    INSERT INTO product_variants (id, product_id, name, size, sku, price_override, stock_quantity, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const prod of products) {
    insertProduct.run(
      prod.id,
      prod.name,
      prod.slug,
      prod.description,
      prod.price,
      prod.currency,
      prod.categoryId,
      prod.images,
      "ACTIVE",
      now,
      now
    );
    let vIdx = 1;
    for (const v of prod.variants) {
      insertVariant.run(
        `${prod.id}_var_${vIdx++}`,
        prod.id,
        v.name,
        v.size,
        v.sku,
        null,
        v.stock,
        "ACTIVE"
      );
    }
  }
}

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
async function startServer() {
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
  const isProd = process.env.NODE_ENV === "production";
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  const db = getDatabase();
  seedDatabase(db);
  app.get("/health", (req, res) => {
    try {
      const dbCheck = db.prepare("SELECT 1 as ok").get();
      res.json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        database: dbCheck?.ok === 1 ? "connected" : "unhealthy",
        env: process.env.NODE_ENV || "development"
      });
    } catch (err) {
      res.status(503).json({
        status: "error",
        message: err.message
      });
    }
  });
  app.use("/api", createApiRouter());
  app.use("/src/assets", express.static(path2.resolve(__dirname, "src", "assets")));
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true"
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.resolve(distPath, "index.html"));
    });
  }
  app.listen(port, "0.0.0.0", () => {
    console.log(`Telegram Mini App store running at http://0.0.0.0:${port}`);
  });
}
startServer().catch((err) => {
  console.error("Fatal server startup error:", err);
  process.exit(1);
});
