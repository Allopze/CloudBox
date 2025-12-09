# ================================
# CloudBox Frontend - Production Dockerfile
# Multi-stage build with NGINX
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
# API URL will be configured via NGINX proxy
ENV VITE_API_URL=/api

RUN npm run build

# ================================
# Stage 2: Production with NGINX
FROM nginx:alpine AS production

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Create non-root user
RUN addgroup -g 1001 -S cloudbox && \
    adduser -S cloudbox -u 1001 -G cloudbox && \
    chown -R cloudbox:cloudbox /usr/share/nginx/html && \
    chown -R cloudbox:cloudbox /var/cache/nginx && \
    chown -R cloudbox:cloudbox /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R cloudbox:cloudbox /var/run/nginx.pid

# Switch to non-root user
USER cloudbox

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:8080/ || exit 1

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]
