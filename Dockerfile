# Multi-stage Dockerfile for Telegram Mini App Store
# Stage 1: Build Frontend Assets
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source code and build client
COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Install curl for container health check
RUN apk add --no-cache curl

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:/app/data/store.db"

# Install production dependencies only
COPY package.json ./
RUN npm install --omit=dev

# Copy built frontend bundle from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend server and source modules
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src ./src

# Create directory for persistent SQLite database
RUN mkdir -p /app/data

# Persistent storage mount point for database
VOLUME ["/app/data"]

EXPOSE 3000

# Health check using server /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the full-stack server
CMD ["npm", "run", "start"]
