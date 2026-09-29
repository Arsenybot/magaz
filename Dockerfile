# Multi-stage production-ready Dockerfile for Node.js + TypeScript (Telegram Bot + Mini App Store)
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies needed for build
COPY package*.json ./
COPY tsconfig*.json ./
RUN npm install --legacy-peer-deps

# Copy source code and build config
COPY index.html ./
COPY vite.config.ts ./
COPY server.ts ./
COPY src ./src

# Build frontend (Vite) and server (esbuild bundle -> dist/server.cjs)
RUN npm run build

# --- Production Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/store.db"

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy compiled bundles from builder stage (contains frontend SPA, assets and server.cjs)
COPY --from=builder /app/dist ./dist

# Create persistent data directory for SQLite
RUN mkdir -p /app/data

# Expose port (Cloud.ru Container Apps, VPS or Webhook)
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:${PORT}/health || exit 1

# Start server (runs node dist/server.cjs which starts Telegram Bot & Mini App)
CMD ["node", "dist/server.cjs"]
