# ==========================================
# Multi-stage Dockerfile: Node 22 Debian Slim
# Standard glibc runtime (zero musl/esbuild compatibility issues)
# ==========================================

# Stage 1: Build both client and server bundles
FROM node:22-slim AS builder

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install all build dependencies
RUN npm install

# Copy application source code
COPY . .

# Build Vite frontend (/app/dist) and esbuild backend (/app/dist-server)
RUN npm run build

# Stage 2: Minimal Production Runtime
FROM node:22-slim AS runner

WORKDIR /app

# Install curl for container health check
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/store.db"

# Copy package descriptors and install only runtime production packages
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy compiled frontend and backend bundles
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/src/assets ./src/assets

# Create directory for persistent SQLite database with write permissions
RUN mkdir -p /app/data && chmod 777 /app/data

# Persistent storage mount point
VOLUME ["/app/data"]

EXPOSE 3000

# Health check using server /health endpoint
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start production server using pure Node.js (no loaders or compilation)
CMD ["node", "dist-server/index.js"]
