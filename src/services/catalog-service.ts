import { getDatabase } from '../database/db.ts';
import { Product, ProductVariant, Category, ProductStatus } from '../core/types.ts';
import { NotFoundError, ValidationError } from '../core/errors.ts';
import crypto from 'node:crypto';

export class CatalogService {
  /**
   * Get all active categories ordered by sortOrder
   */
  public getCategories(includeInactive = false): Category[] {
    const db = getDatabase();
    const query = includeInactive
      ? 'SELECT * FROM categories ORDER BY sort_order ASC'
      : 'SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC';
    const rows = db.prepare(query).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description || '',
      image: r.image || '',
      sortOrder: r.sort_order,
      active: Boolean(r.active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Get catalog products with optional filters
   */
  public getProducts(params?: { categoryId?: string; search?: string; status?: ProductStatus }): Product[] {
    const db = getDatabase();
    const conditions: string[] = [];
    const values: any[] = [];

    const status = params?.status || 'ACTIVE';
    conditions.push('p.status = ?');
    values.push(status);

    if (params?.categoryId) {
      conditions.push('p.category_id = ?');
      values.push(params.categoryId);
    }

    if (params?.search) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ?)');
      const term = `%${params.search}%`;
      values.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ORDER BY p.created_at DESC
    `;

    const products = db.prepare(sql).all(...values) as any[];

    // Hydrate variants for each product
    const getVariantsStmt = db.prepare(`
      SELECT * FROM product_variants WHERE product_id = ? AND status = 'ACTIVE' ORDER BY size ASC
    `);

    return products.map((p) => {
      const variants = getVariantsStmt.all(p.id) as any[];
      const totalStock = variants.reduce((sum, v) => sum + v.stock_quantity, 0);

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description || '',
        price: p.price,
        currency: p.currency,
        categoryId: p.category_id,
        categoryName: p.category_name,
        images: JSON.parse(p.images || '[]'),
        status: p.status,
        variants: variants.map((v) => ({
          id: v.id,
          productId: v.product_id,
          name: v.name,
          size: v.size,
          sku: v.sku,
          priceOverride: v.price_override,
          stockQuantity: v.stock_quantity,
          status: v.status,
        })),
        totalStock,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    });
  }

  /**
   * Get single product with full variants and category details
   */
  public getProductById(id: string): Product {
    const db = getDatabase();
    const p = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(id) as any;

    if (!p) {
      throw new NotFoundError('Product', id);
    }

    const variants = db.prepare(`
      SELECT * FROM product_variants WHERE product_id = ? ORDER BY size ASC
    `).all(p.id) as any[];

    const totalStock = variants.reduce((sum, v) => sum + v.stock_quantity, 0);

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description || '',
      price: p.price,
      currency: p.currency,
      categoryId: p.category_id,
      categoryName: p.category_name,
      images: JSON.parse(p.images || '[]'),
      status: p.status,
      variants: variants.map((v) => ({
        id: v.id,
        productId: v.product_id,
        name: v.name,
        size: v.size,
        sku: v.sku,
        priceOverride: v.price_override,
        stockQuantity: v.stock_quantity,
        status: v.status,
      })),
      totalStock,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }

  /**
   * Admin: Create category
   */
  public createCategory(data: Partial<Category>): Category {
    if (!data.name) throw new ValidationError('Название категории обязательно');
    const db = getDatabase();
    const id = `cat_${crypto.randomUUID().slice(0, 8)}`;
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO categories (id, name, slug, description, image, sort_order, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.name, slug, data.description || '', data.image || '', data.sortOrder || 0, data.active !== false ? 1 : 0, now, now);

    return {
      id,
      name: data.name,
      slug,
      description: data.description || '',
      image: data.image || '',
      sortOrder: data.sortOrder || 0,
      active: data.active !== false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Admin: Update category
   */
  public updateCategory(id: string, data: Partial<Category>): Category {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any;
    if (!existing) throw new NotFoundError('Category', id);

    const now = new Date().toISOString();
    const name = data.name !== undefined ? data.name : existing.name;
    const slug = data.slug !== undefined ? data.slug : existing.slug;
    const description = data.description !== undefined ? data.description : existing.description;
    const image = data.image !== undefined ? data.image : existing.image;
    const sortOrder = data.sortOrder !== undefined ? data.sortOrder : existing.sort_order;
    const active = data.active !== undefined ? (data.active ? 1 : 0) : existing.active;

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
      updatedAt: now,
    };
  }

  /**
   * Admin: Delete category
   */
  public deleteCategory(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  /**
   * Admin: Create product with variants
   */
  public createProduct(data: {
    name: string;
    slug?: string;
    description?: string;
    price: number;
    currency?: string;
    categoryId: string;
    images?: string[];
    status?: ProductStatus;
    variants?: { name: string; size: string; sku: string; priceOverride?: number | null; stockQuantity: number }[];
  }): Product {
    if (!data.name) throw new ValidationError('Название товара обязательно');
    if (!data.price || data.price < 0) throw new ValidationError('Цена товара должна быть положительной');
    if (!data.categoryId) throw new ValidationError('Категория товара обязательна');

    const db = getDatabase();
    const id = `prod_${crypto.randomUUID().slice(0, 8)}`;
    const slug = data.slug || `${data.name.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '-')}-${id.slice(-4)}`;
    const now = new Date().toISOString();
    const imagesJson = JSON.stringify(data.images || []);

    db.exec('BEGIN IMMEDIATE;');
    try {
      db.prepare(`
        INSERT INTO products (id, name, slug, description, price, currency, category_id, images, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.name,
        slug,
        data.description || '',
        data.price,
        data.currency || 'RUB',
        data.categoryId,
        imagesJson,
        data.status || 'ACTIVE',
        now,
        now
      );

      const variants = data.variants && data.variants.length > 0 ? data.variants : [
        { name: 'ONE SIZE', size: 'ONE SIZE', sku: `${slug.toUpperCase()}-OS`, stockQuantity: 10 },
      ];

      const insertVariantStmt = db.prepare(`
        INSERT INTO product_variants (id, product_id, name, size, sku, price_override, stock_quantity, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      `);

      for (const v of variants) {
        const vId = `var_${crypto.randomUUID().slice(0, 8)}`;
        insertVariantStmt.run(vId, id, v.name, v.size, v.sku, v.priceOverride || null, v.stockQuantity || 0);
      }

      db.exec('COMMIT;');
      return this.getProductById(id);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Admin: Update product and optionally replace/update variants
   */
  public updateProduct(id: string, data: Partial<Product> & { variants?: any[] }): Product {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!existing) throw new NotFoundError('Product', id);

    const now = new Date().toISOString();
    const name = data.name !== undefined ? data.name : existing.name;
    const slug = data.slug !== undefined ? data.slug : existing.slug;
    const description = data.description !== undefined ? data.description : existing.description;
    const price = data.price !== undefined ? data.price : existing.price;
    const categoryId = data.categoryId !== undefined ? data.categoryId : existing.category_id;
    const status = data.status !== undefined ? data.status : existing.status;
    const imagesJson = data.images !== undefined ? JSON.stringify(data.images) : existing.images;

    db.exec('BEGIN IMMEDIATE;');
    try {
      db.prepare(`
        UPDATE products SET
          name = ?, slug = ?, description = ?, price = ?, category_id = ?, images = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(name, slug, description, price, categoryId, imagesJson, status, now, id);

      if (data.variants && Array.isArray(data.variants)) {
        // Update variants
        for (const v of data.variants) {
          if (v.id) {
            db.prepare(`
              UPDATE product_variants SET
                name = ?, size = ?, sku = ?, price_override = ?, stock_quantity = ?, status = ?
              WHERE id = ? AND product_id = ?
            `).run(v.name, v.size, v.sku, v.priceOverride || null, v.stockQuantity, v.status || 'ACTIVE', v.id, id);
          } else {
            const vId = `var_${crypto.randomUUID().slice(0, 8)}`;
            db.prepare(`
              INSERT INTO product_variants (id, product_id, name, size, sku, price_override, stock_quantity, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
            `).run(vId, id, v.name, v.size, v.sku, v.priceOverride || null, v.stockQuantity);
          }
        }
      }

      db.exec('COMMIT;');
      return this.getProductById(id);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Admin: Delete product
   */
  public deleteProduct(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
  }
}
