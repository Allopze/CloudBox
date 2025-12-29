# CloudBox Backend - Production (Release)
# Using Debian slim instead of Alpine for canvas prebuilt binaries
FROM node:20-slim

WORKDIR /app

# Install OS dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    p7zip-full \
    graphicsmagick \
    poppler-utils \
    tini \
    wget \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package*.json ./
COPY prisma ./prisma

# Install production dependencies
RUN npm ci --omit=dev

# Generate Prisma client for this specific OS
RUN npx prisma generate

# Copy pre-built application
COPY dist ./dist

# Create non-root user and set permissions
RUN groupadd -g 1001 cloudbox && \
    useradd -u 1001 -g cloudbox -s /bin/sh cloudbox && \
    mkdir -p /app/data && \
    chown -R cloudbox:cloudbox /app

USER cloudbox

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -q --spider http://localhost:3001/api/health/ping || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
