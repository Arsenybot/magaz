import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { createApiRouter } from './src/api/routes.ts';
import { getDatabase } from './src/database/db.ts';
import { seedDatabase } from './src/database/seed.ts';

dotenv.config();

async function startServer() {
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Parse JSON and urlencoded payloads
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize DB and Seed default catalog
  const db = getDatabase();
  seedDatabase(db);

  // Health check handler (Requirement 29: supports /health and /api/health)
  const healthHandler = (_req: express.Request, res: express.Response) => {
    try {
      const dbCheck = db.prepare('SELECT 1 as ok').get() as { ok: number };
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: dbCheck?.ok === 1 ? 'connected' : 'unhealthy',
        env: process.env.NODE_ENV || 'development',
      });
    } catch (err: any) {
      res.status(503).json({
        status: 'error',
        message: err.message,
      });
    }
  };

  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // Mount API router
  app.use('/api', createApiRouter());

  const rootDir = process.cwd();
  const distPath = path.resolve(rootDir, 'dist');
  const distAssets = path.resolve(distPath, 'src', 'assets');
  const srcAssets = path.resolve(rootDir, 'src', 'assets');
  const assetsPath = fs.existsSync(distAssets) ? distAssets : srcAssets;

  // Static assets (product images)
  app.use('/src/assets', express.static(assetsPath));

  if (!isProd) {
    // Development mode: Vite dev server with middleware mode
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve compiled assets
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Telegram Mini App store running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
