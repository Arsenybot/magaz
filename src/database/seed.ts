import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './db.ts';

export function seedDatabase(db?: DatabaseSync): void {
  const database = db || getDatabase();

  // Check if store settings already seeded
  const check = database.prepare('SELECT COUNT(*) as count FROM store_settings').get() as { count: number };
  if (check && check.count > 0) {
    return;
  }

  const now = new Date().toISOString();

  // 1. Store settings
  database.prepare(`
    INSERT INTO store_settings (
      id, store_name, description, logo, currency, contact_telegram, contact_phone,
      delivery_enabled, pickup_enabled, payment_enabled, delivery_price, free_delivery_threshold,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'store_main',
    'ATELIER / Minimalist Apparel',
    'Премиальный базовый гардероб и концептуальный streetwear в Telegram.',
    '',
    'RUB',
    '@atelier_support',
    '+7 (999) 000-11-22',
    1,
    1,
    1,
    350,
    5000,
    now,
    now
  );

  // 2. Initial Users (Admin + Demo Buyer)
  database.prepare(`
    INSERT INTO users (id, telegram_id, username, first_name, last_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user_admin_1', '123456789', 'admin_seller', 'Константин', 'Администратор', 'ADMIN', now, now);

  database.prepare(`
    INSERT INTO users (id, telegram_id, username, first_name, last_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('user_buyer_1', '999888777', 'alex_buyer', 'Александр', 'Покупатель', 'CUSTOMER', now, now);

  // 3. Categories
  const categories = [
    {
      id: 'cat_tshirts',
      name: 'Футболки',
      slug: 't-shirts',
      description: 'Плотный органический хлопок 240г/м², прямой крой и оверсайз посадка.',
      image: '/src/assets/images/oversized_tee_1790542603531.jpg',
      sortOrder: 1,
    },
    {
      id: 'cat_hoodies',
      name: 'Худи и толстовки',
      slug: 'hoodies',
      description: 'Утепленный футер с начесом 450г/м², двойной капюшон и спущенная линия плеч.',
      image: '/src/assets/images/hoodie_essential_1790542614014.jpg',
      sortOrder: 2,
    },
    {
      id: 'cat_pants',
      name: 'Брюки и карго',
      slug: 'pants',
      description: 'Свободный силуэт, прочный хлопковый твил и функциональные карманы.',
      image: '/src/assets/images/cargo_pants_1790542626069.jpg',
      sortOrder: 3,
    },
    {
      id: 'cat_accessories',
      name: 'Аксессуары',
      slug: 'accessories',
      description: 'Шапки из мериносовой шерсти, сумки-тоуты и базовые детали.',
      image: '/src/assets/images/minimal_beanie_1790542635742.jpg',
      sortOrder: 4,
    },
  ];

  const insertCategory = database.prepare(`
    INSERT INTO categories (id, name, slug, description, image, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const cat of categories) {
    insertCategory.run(cat.id, cat.name, cat.slug, cat.description, cat.image, cat.sortOrder, 1, now, now);
  }

  // 4. Products & Variants (8 full items)
  const products = [
    {
      id: 'prod_tee_heavy_black',
      name: 'Футболка Heavyweight Oversize Black',
      slug: 'heavyweight-oversize-black',
      description: 'Флагманская футболка из суперплотного хлопка 260г/м². Фактурное полотно держит форму, усиленный ворот не растягивается после стирок. Фирменный объемный крой.',
      price: 2800,
      currency: 'RUB',
      categoryId: 'cat_tshirts',
      images: JSON.stringify(['/src/assets/images/oversized_tee_1790542603531.jpg']),
      variants: [
        { name: 'Размер S', size: 'S', sku: 'TEE-BLK-S', stock: 12 },
        { name: 'Размер M', size: 'M', sku: 'TEE-BLK-M', stock: 18 },
        { name: 'Размер L', size: 'L', sku: 'TEE-BLK-L', stock: 15 },
        { name: 'Размер XL', size: 'XL', sku: 'TEE-BLK-XL', stock: 8 },
      ],
    },
    {
      id: 'prod_tee_boxy_cream',
      name: 'Футболка Boxy Cut Raw Cream',
      slug: 'boxy-cut-raw-cream',
      description: 'Укороченный свободный силуэт boxy fit в натуральном невыбеленном оттенке экрю. Открытые срезы, плотный гребенной хлопок 230г/м².',
      price: 2900,
      currency: 'RUB',
      categoryId: 'cat_tshirts',
      images: JSON.stringify(['/src/assets/images/oversized_tee_1790542603531.jpg']),
      variants: [
        { name: 'Размер S', size: 'S', sku: 'TEE-CRM-S', stock: 10 },
        { name: 'Размер M', size: 'M', sku: 'TEE-CRM-M', stock: 14 },
        { name: 'Размер L', size: 'L', sku: 'TEE-CRM-L', stock: 11 },
        { name: 'Размер XL', size: 'XL', sku: 'TEE-CRM-XL', stock: 5 },
      ],
    },
    {
      id: 'prod_hoodie_washed_charcoal',
      name: 'Худи Essential Washed Charcoal',
      slug: 'essential-washed-charcoal',
      description: 'Тяжелый трехниточный футер 460г/м² с мягким внутренним начесом. Винтажная варка garment dye с благородным графитовым отливом. Глубокий анатомический капюшон.',
      price: 5900,
      currency: 'RUB',
      categoryId: 'cat_hoodies',
      images: JSON.stringify(['/src/assets/images/hoodie_essential_1790542614014.jpg']),
      variants: [
        { name: 'Размер S', size: 'S', sku: 'HD-CHR-S', stock: 8 },
        { name: 'Размер M', size: 'M', sku: 'HD-CHR-M', stock: 14 },
        { name: 'Размер L', size: 'L', sku: 'HD-CHR-L', stock: 10 },
        { name: 'Размер XL', size: 'XL', sku: 'HD-CHR-XL', stock: 6 },
      ],
    },
    {
      id: 'prod_hoodie_zip_grey',
      name: 'Зип-худи Architectural Grey',
      slug: 'architectural-zip-grey',
      description: 'Минималистичное худи на массивной металлической молнии YKK с двумя бегунками. Плотная турецкая хлопковая пряжа, минималистичные скрытые карманы в боковых швах.',
      price: 6400,
      currency: 'RUB',
      categoryId: 'cat_hoodies',
      images: JSON.stringify(['/src/assets/images/hoodie_essential_1790542614014.jpg']),
      variants: [
        { name: 'Размер S', size: 'S', sku: 'ZIP-GRY-S', stock: 6 },
        { name: 'Размер M', size: 'M', sku: 'ZIP-GRY-M', stock: 10 },
        { name: 'Размер L', size: 'L', sku: 'ZIP-GRY-L', stock: 8 },
        { name: 'Размер XL', size: 'XL', sku: 'ZIP-GRY-XL', stock: 4 },
      ],
    },
    {
      id: 'prod_pants_cargo_olive',
      name: 'Брюки Utility Relaxed Cargo Olive',
      slug: 'utility-relaxed-cargo-olive',
      description: 'Широкие карго из прочного рипстопа с водоотталкивающей пропиткой. Анатомические складки на коленях, кулиски по низу брючин для регулировки посадки.',
      price: 5200,
      currency: 'RUB',
      categoryId: 'cat_pants',
      images: JSON.stringify(['/src/assets/images/cargo_pants_1790542626069.jpg']),
      variants: [
        { name: 'Размер S', size: 'S', sku: 'CRG-OLV-S', stock: 7 },
        { name: 'Размер M', size: 'M', sku: 'CRG-OLV-M', stock: 12 },
        { name: 'Размер L', size: 'L', sku: 'CRG-OLV-L', stock: 9 },
        { name: 'Размер XL', size: 'XL', sku: 'CRG-OLV-XL', stock: 3 },
      ],
    },
    {
      id: 'prod_pants_wide_black',
      name: 'Брюки Wide Pleated Minimalist Black',
      slug: 'wide-pleated-black',
      description: 'Элегантные свободные брюки со складками у пояса. Смесовая ткань с шерстью премиум-класса, мягкая драпировка и комфортная полуэластичная резинка сзади.',
      price: 4900,
      currency: 'RUB',
      categoryId: 'cat_pants',
      images: JSON.stringify(['/src/assets/images/cargo_pants_1790542626069.jpg']),
      variants: [
        { name: 'Размер S', size: 'S', sku: 'PLT-BLK-S', stock: 9 },
        { name: 'Размер M', size: 'M', sku: 'PLT-BLK-M', stock: 15 },
        { name: 'Размер L', size: 'L', sku: 'PLT-BLK-L', stock: 11 },
        { name: 'Размер XL', size: 'XL', sku: 'PLT-BLK-XL', stock: 5 },
      ],
    },
    {
      id: 'prod_acc_merino_beanie',
      name: 'Шапка Ribbed Merino Wool Beanie',
      slug: 'ribbed-merino-beanie',
      description: '100% тонкорунная мериносовая шерсть extra fine. Английская фактурная резинка, плотная посадка, не колется и отлично держит тепло.',
      price: 1900,
      currency: 'RUB',
      categoryId: 'cat_accessories',
      images: JSON.stringify(['/src/assets/images/minimal_beanie_1790542635742.jpg']),
      variants: [
        { name: 'ONE SIZE (Универсальный)', size: 'ONE SIZE', sku: 'ACC-BN-BLK', stock: 25 },
      ],
    },
    {
      id: 'prod_acc_canvas_tote',
      name: 'Сумка-тоут Heavyweight Canvas Tote',
      slug: 'canvas-tote-natural',
      description: 'Вместительный тоут из плотного парусинового канваса 400г/м². Двойные прошитые ручки, внутренний карман на молнии для ключей и смартфона.',
      price: 2400,
      currency: 'RUB',
      categoryId: 'cat_accessories',
      images: JSON.stringify(['/src/assets/images/minimal_beanie_1790542635742.jpg']),
      variants: [
        { name: 'ONE SIZE (Вместимость 22L)', size: 'ONE SIZE', sku: 'ACC-TOT-NAT', stock: 20 },
      ],
    },
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
      'ACTIVE',
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
        'ACTIVE'
      );
    }
  }
}
