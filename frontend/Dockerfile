# ================================
# CloudBox Frontend - Production Dockerfile
# Multi-stage build with Caddy
# ================================

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build for production
# API URL will be configured via Caddy proxy
ENV VITE_API_URL=/api

RUN npm run build

# ================================
# Stage 2: Production with Caddy
FROM caddy:alpine AS production

# Copy Caddyfile configuration
COPY Caddyfile /etc/caddy/Caddyfile

# Copy built assets from builder stage
COPY --from=builder /app/dist /srv

# Create non-root user
RUN addgroup -g 1001 -S cloudbox && \
    adduser -S cloudbox -u 1001 -G cloudbox && \
    chown -R cloudbox:cloudbox /srv && \
    chown -R cloudbox:cloudbox /config && \
    chown -R cloudbox:cloudbox /data

# Switch to non-root user
USER cloudbox

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:5000/health || exit 1

# Start Caddy
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
