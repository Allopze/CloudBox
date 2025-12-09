# ================================
# CloudBox Backend - Production Dockerfile
# Multi-stage build for optimized image
# ================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ 

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Remove devDependencies
RUN npm prune --production

# ================================
# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install runtime dependencies
# - ffmpeg: video/audio transcoding
# - 7zip: archive extraction
# - graphicsmagick: PDF thumbnails
RUN apk add --no-cache \
    ffmpeg \
    p7zip \
    graphicsmagick \
    tini

# Create non-root user for security
RUN addgroup -g 1001 -S cloudbox && \
    adduser -S cloudbox -u 1001 -G cloudbox

# Copy built application from builder stage
COPY --from=builder --chown=cloudbox:cloudbox /app/dist ./dist
COPY --from=builder --chown=cloudbox:cloudbox /app/node_modules ./node_modules
COPY --from=builder --chown=cloudbox:cloudbox /app/prisma ./prisma
COPY --from=builder --chown=cloudbox:cloudbox /app/package.json ./

# Create data directory for file storage
RUN mkdir -p /app/data && chown -R cloudbox:cloudbox /app/data

# Switch to non-root user
USER cloudbox

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:3001/api/health/ping || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Run database migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
