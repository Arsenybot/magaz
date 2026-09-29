import { Router, Request, Response, NextFunction } from 'express';
import { CatalogService } from '../services/catalog-service.ts';
import { CartService } from '../services/cart-service.ts';
import { OrderService } from '../services/order-service.ts';
import { PaymentService } from '../payments/payment-service.ts';
import { AdminService } from '../services/admin-service.ts';
import { TelegramAuth } from '../telegram/telegram-auth.ts';
import { TelegramBotAdapter } from '../telegram/telegram-bot.ts';
import { NotificationService } from '../telegram/notification-service.ts';
import { AppError, UnauthorizedError, ForbiddenError } from '../core/errors.ts';
import { User } from '../core/types.ts';
import { getDatabase } from '../database/db.ts';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function createApiRouter(): Router {
  const router = Router();

  const catalogService = new CatalogService();
  const cartService = new CartService();
  const notificationService = new NotificationService();
  const paymentService = new PaymentService(notificationService);
  const orderService = new OrderService(cartService, notificationService);
  const adminService = new AdminService();
  const botAdapter = new TelegramBotAdapter();

  // Authentication Middleware
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
      const initData = req.headers['x-telegram-init-data'] as string;
      const customUserId = req.headers['x-user-id'] as string;

      if (initData) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
        const validation = TelegramAuth.validateInitData(initData, botToken);
        if (validation.isValid && validation.user) {
          req.user = TelegramAuth.findOrCreateUser(validation.user);
          return next();
        }
      }

      if (customUserId) {
        const db = getDatabase();
        const userRow = db.prepare('SELECT * FROM users WHERE id = ? OR telegram_id = ?').get(customUserId, customUserId) as any;
        if (userRow) {
          req.user = {
            id: userRow.id,
            telegramId: userRow.telegram_id,
            username: userRow.username,
            firstName: userRow.first_name,
            lastName: userRow.last_name,
            role: userRow.role,
            createdAt: userRow.created_at,
            updatedAt: userRow.updated_at,
          };
          return next();
        }
      }

      // Default demo user fallback for development mode if neither is provided
      if (process.env.NODE_ENV !== 'production') {
        const db = getDatabase();
        const demoUser = db.prepare('SELECT * FROM users WHERE role = ? LIMIT 1').get('CUSTOMER') as any;
        if (demoUser) {
          req.user = {
            id: demoUser.id,
            telegramId: demoUser.telegram_id,
            username: demoUser.username,
            firstName: demoUser.first_name,
            lastName: demoUser.last_name,
            role: demoUser.role,
            createdAt: demoUser.created_at,
            updatedAt: demoUser.updated_at,
          };
          return next();
        }
      }

      throw new UnauthorizedError('Пожалуйста, авторизуйтесь через Telegram.');
    } catch (err) {
      next(err);
    }
  };

  // Admin Guard Middleware
  const adminGuard = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      return next(new ForbiddenError('Доступ к административной панели разрешён только администраторам.'));
    }
    next();
  };

  // --- PUBLIC & CATALOG ENDPOINTS ---

  // Store information & settings
  router.get('/store', (req, res, next) => {
    try {
      const settings = adminService.getStoreSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });

  // Categories
  router.get('/categories', (req, res, next) => {
    try {
      const categories = catalogService.getCategories();
      res.json(categories);
    } catch (err) {
      next(err);
    }
  });

  // Products
  router.get('/products', (req, res, next) => {
    try {
      const { categoryId, search } = req.query;
      const products = catalogService.getProducts({
        categoryId: categoryId as string,
        search: search as string,
      });
      res.json(products);
    } catch (err) {
      next(err);
    }
  });

  // Single Product
  router.get('/products/:id', (req, res, next) => {
    try {
      const product = catalogService.getProductById(req.params.id);
      res.json(product);
    } catch (err) {
      next(err);
    }
  });

  // --- TELEGRAM AUTHENTICATION ---

  router.post('/auth/telegram', (req, res, next) => {
    try {
      const { initData, mockUser } = req.body;
      const botToken = process.env.TELEGRAM_BOT_TOKEN || '';

      if (mockUser && process.env.NODE_ENV !== 'production') {
        const user = TelegramAuth.findOrCreateUser(mockUser);
        return res.json({ user, token: user.id });
      }

      if (!initData) {
        throw new AppError('Missing Telegram initData', 400);
      }

      const result = TelegramAuth.validateInitData(initData, botToken);
      if (!result.isValid || !result.user) {
        throw new UnauthorizedError('Недействительная подпись данных Telegram');
      }

      const user = TelegramAuth.findOrCreateUser(result.user);
      res.json({ user, token: user.id });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/me', authMiddleware, (req, res) => {
    res.json(req.user);
  });

  // --- CART ENDPOINTS ---

  router.get('/cart', authMiddleware, (req, res, next) => {
    try {
      const cart = cartService.getOrCreateCart(req.user!.id);
      res.json(cart);
    } catch (err) {
      next(err);
    }
  });

  router.post('/cart', authMiddleware, (req, res, next) => {
    try {
      const { productId, variantId, quantity } = req.body;
      const cart = cartService.addItem(req.user!.id, productId, variantId, quantity || 1);
      res.json(cart);
    } catch (err) {
      next(err);
    }
  });

  router.put('/cart/items/:id', authMiddleware, (req, res, next) => {
    try {
      const { quantity } = req.body;
      const cart = cartService.updateItemQuantity(req.user!.id, req.params.id, Number(quantity));
      res.json(cart);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/cart/items/:id', authMiddleware, (req, res, next) => {
    try {
      const cart = cartService.removeItem(req.user!.id, req.params.id);
      res.json(cart);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/cart', authMiddleware, (req, res, next) => {
    try {
      cartService.clearCart(req.user!.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  // --- ORDERS ENDPOINTS ---

  router.post('/orders', authMiddleware, async (req, res, next) => {
    try {
      const { customerName, customerPhone, customerUsername, deliveryMethod, deliveryAddress, comment, paymentProvider } = req.body;
      const order = await orderService.createOrder({
        userId: req.user!.id,
        customerName,
        customerPhone,
        customerUsername: customerUsername || req.user!.username,
        deliveryMethod: deliveryMethod || 'DELIVERY',
        deliveryAddress,
        comment,
        paymentProvider,
      });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders', authMiddleware, (req, res, next) => {
    try {
      const orders = orderService.getUserOrders(req.user!.id);
      res.json(orders);
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders/:id', authMiddleware, (req, res, next) => {
    try {
      const order = orderService.getOrderById(req.params.id, req.user);
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  // --- PAYMENT ENDPOINTS ---

  router.post('/orders/:id/payment', authMiddleware, async (req, res, next) => {
    try {
      // Check order ownership
      orderService.getOrderById(req.params.id, req.user);
      const paymentResult = await paymentService.createPayment(req.params.id, req.body.returnUrl);
      res.json(paymentResult);
    } catch (err) {
      next(err);
    }
  });

  // Webhook endpoint for Payment Providers
  router.post('/payments/webhook', async (req, res, next) => {
    try {
      const provider = (req.query.provider as string) || req.body.provider || 'mock';
      const result = await paymentService.processWebhook(provider, req.body, req.headers as any);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Mock simulation for testing payments in dev mode
  router.post('/payments/mock-simulate', async (req, res, next) => {
    try {
      const { orderId, providerPaymentId, status, isDuplicate } = req.body;
      const idempotencyKey = isDuplicate
        ? `mock_evt_${providerPaymentId || orderId}_first`
        : `mock_evt_${providerPaymentId || orderId}_${Date.now()}`;

      const result = await paymentService.processWebhook('mock', {
        providerPaymentId: providerPaymentId || `mock_sim_${Date.now()}`,
        orderId,
        idempotencyKey,
        status: status || 'PAID',
        amount: req.body.amount || 0,
        currency: 'RUB',
        eventType: status === 'PAID' ? 'payment.succeeded' : 'payment.failed',
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Telegram Bot Webhook
  router.post('/telegram/webhook', async (req, res, next) => {
    try {
      const result = await botAdapter.handleUpdate(req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // --- ADMIN ENDPOINTS (Protected with adminGuard) ---

  router.get('/admin/dashboard', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const stats = adminService.getDashboardStats();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/products', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const products = catalogService.getProducts({ status: req.query.status as any });
      res.json(products);
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/products', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const created = catalogService.createProduct(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/products/:id', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const updated = catalogService.updateProduct(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/admin/products/:id', authMiddleware, adminGuard, (req, res, next) => {
    try {
      catalogService.deleteProduct(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/categories', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const category = catalogService.createCategory(req.body);
      res.status(201).json(category);
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/categories/:id', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const category = catalogService.updateCategory(req.params.id, req.body);
      res.json(category);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/admin/categories/:id', authMiddleware, adminGuard, (req, res, next) => {
    try {
      catalogService.deleteCategory(req.params.id);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/orders', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const orders = adminService.getOrders({
        status: req.query.status as string,
        paymentStatus: req.query.paymentStatus as string,
        search: req.query.search as string,
      });
      res.json(orders);
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/orders/:id', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const order = orderService.getOrderById(req.params.id, req.user);
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/orders/:id/status', authMiddleware, adminGuard, async (req, res, next) => {
    try {
      const { status } = req.body;
      const order = await orderService.updateOrderStatus(req.params.id, status, req.user!);
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/customers', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const customers = adminService.getCustomers();
      res.json(customers);
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/settings', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const settings = adminService.getStoreSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/settings', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const updated = adminService.updateStoreSettings(req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/notifications', authMiddleware, adminGuard, (req, res, next) => {
    try {
      const notifications = adminService.getNotifications();
      res.json(notifications);
    } catch (err) {
      next(err);
    }
  });

  // Error handling middleware for API router
  router.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({
      error: {
        code: err.code || 'INTERNAL_SERVER_ERROR',
        message,
      },
    });
  });

  return router;
}
