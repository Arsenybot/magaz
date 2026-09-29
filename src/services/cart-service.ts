import { getDatabase } from '../database/db.ts';
import { Cart, CartItem, Product, ProductVariant } from '../core/types.ts';
import { NotFoundError, InsufficientStockError, ValidationError } from '../core/errors.ts';
import crypto from 'node:crypto';

export class CartService {
  /**
   * Get or create a cart for the specified user
   */
  public getOrCreateCart(userId: string): Cart {
    const db = getDatabase();
    let cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(userId) as any;

    if (!cart) {
      const cartId = `cart_${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO carts (id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(cartId, userId, now, now);
      cart = { id: cartId, user_id: userId, created_at: now, updated_at: now };
    }

    // Hydrate cart items with fresh data from database
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
    `).all(cart.id) as any[];

    let subtotal = 0;
    let itemsCount = 0;

    const items: CartItem[] = itemsRows.map((row) => {
      const unitPrice = row.price_override !== null && row.price_override !== undefined ? row.price_override : row.product_price;
      const isAvailable = row.product_status === 'ACTIVE' && row.variant_status === 'ACTIVE' && row.stock_quantity >= row.quantity;
      const totalPrice = unitPrice * row.quantity;

      if (isAvailable) {
        subtotal += totalPrice;
      }
      itemsCount += row.quantity;

      const product: Product = {
        id: row.product_id,
        name: row.product_name,
        slug: row.product_slug,
        description: '',
        price: row.product_price,
        currency: row.product_currency,
        categoryId: '',
        images: JSON.parse(row.product_images || '[]'),
        status: row.product_status,
        createdAt: '',
        updatedAt: '',
      };

      const variant: ProductVariant = {
        id: row.variant_id,
        productId: row.product_id,
        name: row.variant_name,
        size: row.variant_size,
        sku: row.variant_sku,
        priceOverride: row.price_override,
        stockQuantity: row.stock_quantity,
        status: row.variant_status,
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
        availableStock: row.stock_quantity,
      };
    });

    return {
      id: cart.id,
      userId,
      items,
      subtotal,
      itemsCount,
    };
  }

  /**
   * Add item to cart with stock validation
   */
  public addItem(userId: string, productId: string, variantId: string, quantity = 1): Cart {
    if (quantity <= 0) throw new ValidationError('Количество должно быть больше нуля');

    const db = getDatabase();
    const cart = this.getOrCreateCart(userId);

    // Validate variant and available stock
    const variant = db.prepare(`
      SELECT pv.*, p.name as product_name, p.status as product_status
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ? AND pv.product_id = ?
    `).get(variantId, productId) as any;

    if (!variant || variant.product_status !== 'ACTIVE' || variant.status !== 'ACTIVE') {
      throw new NotFoundError('Товар или выбранный размер недоступен к заказу');
    }

    const existingItem = db.prepare(`
      SELECT * FROM cart_items WHERE cart_id = ? AND variant_id = ?
    `).get(cart.id, variantId) as any;

    const currentQtyInCart = existingItem ? existingItem.quantity : 0;
    const requestedTotal = currentQtyInCart + quantity;

    if (requestedTotal > variant.stock_quantity) {
      throw new InsufficientStockError(variant.product_name, requestedTotal, variant.stock_quantity);
    }

    const now = new Date().toISOString();

    if (existingItem) {
      db.prepare(`
        UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?
      `).run(requestedTotal, now, existingItem.id);
    } else {
      const itemId = `ci_${crypto.randomUUID().slice(0, 8)}`;
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
  public updateItemQuantity(userId: string, cartItemId: string, quantity: number): Cart {
    const db = getDatabase();
    const cart = this.getOrCreateCart(userId);

    const item = db.prepare(`
      SELECT ci.*, pv.stock_quantity, p.name as product_name
      FROM cart_items ci
      JOIN product_variants pv ON ci.variant_id = pv.id
      JOIN products p ON ci.product_id = p.id
      WHERE ci.id = ? AND ci.cart_id = ?
    `).get(cartItemId, cart.id) as any;

    if (!item) {
      throw new NotFoundError('Элемент корзины', cartItemId);
    }

    if (quantity <= 0) {
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(cartItemId);
    } else {
      if (quantity > item.stock_quantity) {
        throw new InsufficientStockError(item.product_name, quantity, item.stock_quantity);
      }
      db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(
        quantity,
        new Date().toISOString(),
        cartItemId
      );
    }

    return this.getOrCreateCart(userId);
  }

  /**
   * Remove item from cart
   */
  public removeItem(userId: string, cartItemId: string): Cart {
    const db = getDatabase();
    const cart = this.getOrCreateCart(userId);
    db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(cartItemId, cart.id);
    return this.getOrCreateCart(userId);
  }

  /**
   * Clear user's cart
   */
  public clearCart(userId: string): void {
    const db = getDatabase();
    const cart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(userId) as any;
    if (cart) {
      db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
    }
  }
}
