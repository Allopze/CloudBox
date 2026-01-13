/**
 * CloudBox Release Script
 * 
 * Creates a production-ready ZIP distributable with:
 * - Compiled backend (Node.js)
 * - Built frontend (static files)
 * - Configuration templates
 * - Prisma schema for migrations
 * 
 * Usage:
 *   npm run release           # Build with current version
 *   npm run release patch     # Bump patch (1.0.0 -> 1.0.1)
 *   npm run release minor     # Bump minor (1.0.0 -> 1.1.0)
 *   npm run release major     # Bump major (1.0.0 -> 2.0.0)
 *   npm run release -- --platform=win64
 *   npm run release -- --platform=linux64
 * 
 * Output: releases/CloudBox-X.X.X.zip
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const rootDir = path.join(__dirname, '..');

function loadArchiver() {
    try {
        return require('archiver');
    } catch (error) {
        console.warn('archiver not found; installing root dependencies...');
        try {
            execSync('npm ci', { cwd: rootDir, stdio: 'inherit' });
        } catch (installError) {
            console.error('Failed to install root dependencies for release');
            throw installError;
        }
        return require('archiver');
    }
}

// Helper functions
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function createZip(sourceDir, outPath) {
    const archiver = loadArchiver();
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);
        archive.directory(sourceDir, path.basename(sourceDir));
        archive.finalize();
    });
}

function bumpVersion(currentVersion, type) {
    const [major, minor, patch] = currentVersion.split('.').map(Number);

    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
        default:
            return currentVersion;
    }
}

async function main() {
    const rootDir = path.join(__dirname, '..');
    const packageJsonPath = path.join(rootDir, 'package.json');

    // Read current version
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    let version = packageJson.version;

    const args = process.argv.slice(2);

    // Check for version bump argument
    const bumpType = args.find((arg) => ['patch', 'minor', 'major'].includes(arg));
    if (['patch', 'minor', 'major'].includes(bumpType)) {
        const oldVersion = version;
        version = bumpVersion(version, bumpType);

        // Update package.json
        packageJson.version = version;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

        console.log(`\n📝 Version bumped: ${oldVersion} → ${version}\n`);
    }

    const platformArg = args.find((arg) => arg.startsWith('--platform='));
    const platformSuffix = platformArg ? platformArg.split('=')[1] : '';
    const releaseName = platformSuffix ? `CloudBox-${version}-${platformSuffix}` : `CloudBox-${version}`;

    // Directories
    const releaseDir = path.join(rootDir, 'releases');
    const tempDir = path.join(releaseDir, releaseName);
    const outputZip = path.join(releaseDir, `${releaseName}.zip`);

    console.log(`📦 Building CloudBox v${version}...\n`);

    // Clean up previous release
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
    }
    if (fs.existsSync(outputZip)) {
        fs.unlinkSync(outputZip);
    }

    // Create directories
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'backend'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'frontend'), { recursive: true });

    // Step 0: Install backend dependencies for reproducible builds
    console.log('Installing backend dependencies...');
    try {
        execSync('npm ci', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });
    } catch (error) {
        console.error('Backend dependency install failed');
        process.exit(1);
    }

    // Step 1: Build backend
    console.log('🔨 Building backend...');
    try {
        execSync('npm run build -- --noImplicitAny false', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });
    } catch (error) {
        console.error('❌ Backend build failed');
        process.exit(1);
    }

    // Step 1.5: Install frontend dependencies for reproducible builds
    console.log('\nInstalling frontend dependencies...');
    try {
        execSync('npm ci', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });
    } catch (error) {
        console.error('Frontend dependency install failed');
        process.exit(1);
    }

    // Step 2: Build frontend
    console.log('\n🔨 Building frontend...');
    try {
        execSync('npm run build', {
            cwd: path.join(rootDir, 'frontend'),
            stdio: 'inherit',
            env: { ...process.env, VITE_API_URL: '/api' }
        });
    } catch (error) {
        console.error('❌ Frontend build failed');
        process.exit(1);
    }

    // Step 3: Copy backend files
    console.log('\n📁 Copying backend files...');
    const backendDest = path.join(tempDir, 'backend');

    // Copy compiled JS
    copyDirSync(path.join(rootDir, 'backend', 'dist'), path.join(backendDest, 'dist'));

    // Copy backend assets (soundfonts for MIDI)
    const assetsSource = path.join(rootDir, 'backend', 'assets');
    if (fs.existsSync(assetsSource)) {
        copyDirSync(assetsSource, path.join(backendDest, 'assets'));
        console.log('   ✓ Backend assets copied (soundfonts)');
    }

    // Copy Prisma schema and migrations
    fs.mkdirSync(path.join(backendDest, 'prisma'), { recursive: true });
    fs.copyFileSync(
        path.join(rootDir, 'backend', 'prisma', 'schema.prisma'),
        path.join(backendDest, 'prisma', 'schema.prisma')
    );
    if (fs.existsSync(path.join(rootDir, 'backend', 'prisma', 'migrations'))) {
        copyDirSync(
            path.join(rootDir, 'backend', 'prisma', 'migrations'),
            path.join(backendDest, 'prisma', 'migrations')
        );
    }

    // Copy package.json and package-lock.json (for reproducible installs)
    const backendPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'backend', 'package.json'), 'utf8'));
    backendPkg.scripts = {
        start: 'node dist/index.js',
        'db:migrate': 'npx prisma migrate deploy',
        'db:generate': 'npx prisma generate',
        'db:seed': 'node dist/prisma/seed.js',
    };
    fs.writeFileSync(path.join(backendDest, 'package.json'), JSON.stringify(backendPkg, null, 2));

    // Copy defaults.json for branding and file icons
    const defaultsJsonSource = path.join(rootDir, 'backend', 'src', 'prisma', 'defaults.json');
    const defaultsJsonDest = path.join(backendDest, 'dist', 'prisma', 'defaults.json');
    if (fs.existsSync(defaultsJsonSource)) {
        fs.mkdirSync(path.join(backendDest, 'dist', 'prisma'), { recursive: true });
        fs.copyFileSync(defaultsJsonSource, defaultsJsonDest);
        console.log('   ✓ defaults.json copied (branding & file icons)');
    }

    // Copy package-lock.json for reproducible builds
    if (fs.existsSync(path.join(rootDir, 'backend', 'package-lock.json'))) {
        fs.copyFileSync(
            path.join(rootDir, 'backend', 'package-lock.json'),
            path.join(backendDest, 'package-lock.json')
        );
    }

    // Copy .env.example
    fs.copyFileSync(
        path.join(rootDir, 'backend', '.env.example'),
        path.join(backendDest, '.env.example')
    );

    // Step 4: Copy frontend build
    console.log('📁 Copying frontend files...');
    copyDirSync(path.join(rootDir, 'frontend', 'dist'), path.join(tempDir, 'frontend', 'dist'));

    // Copy frontend package.json (minimal for serve)
    const frontendPkg = {
        name: 'cloudbox-frontend',
        version: version,
        scripts: {
            serve: 'npx serve -s dist -l 5000',
        },
    };
    fs.writeFileSync(path.join(tempDir, 'frontend', 'package.json'), JSON.stringify(frontendPkg, null, 2));

    // Step 5: Copy default branding assets
    console.log('🎨 Copying default branding assets...');
    const brandingSource = path.join(rootDir, 'data', 'branding');
    const brandingDest = path.join(tempDir, 'data', 'branding');
    if (fs.existsSync(brandingSource)) {
        copyDirSync(brandingSource, brandingDest);
        console.log('   ✓ Branding assets copied (logos, favicon)');
    } else {
        console.log('   ⚠ No branding assets found in data/branding/');
    }

    // Step 6: Copy Docker files
    console.log('🐳 Creating production Docker files...');

    // Docker Compose files
    if (fs.existsSync(path.join(rootDir, 'docker-compose.yml'))) {
        fs.copyFileSync(
            path.join(rootDir, 'docker-compose.yml'),
            path.join(tempDir, 'docker-compose.yml')
        );
    }
    if (fs.existsSync(path.join(rootDir, 'docker-compose.prod.yml'))) {
        fs.copyFileSync(
            path.join(rootDir, 'docker-compose.prod.yml'),
            path.join(tempDir, 'docker-compose.prod.yml')
        );
    }

    // Backend Release Dockerfile (Debian-based for canvas compatibility)
    const backendDockerfile = `# CloudBox Backend - Production (Release)
# Using Debian slim instead of Alpine for canvas prebuilt binaries
FROM node:20-slim

WORKDIR /app

# Install OS dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \\
    ffmpeg \\
    fluidsynth \\
    libreoffice \\
    p7zip-full \\
    graphicsmagick \\
    poppler-utils \\
    tini \\
    wget \\
    build-essential \\
    libcairo2-dev \\
    libpango1.0-dev \\
    libjpeg-dev \\
    libgif-dev \\
    librsvg2-dev \\
    libpixman-1-dev \\
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
COPY assets ./assets

# Create non-root user and set permissions
RUN groupadd -g 1001 cloudbox && \\
    useradd -u 1001 -g cloudbox -s /bin/sh cloudbox && \\
    mkdir -p /app/data && \\
    chown -R cloudbox:cloudbox /app

USER cloudbox

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \\
    CMD wget -q --spider http://localhost:3001/api/health/ping || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD sh -c 'if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then npx prisma migrate deploy; fi; node dist/index.js'
`;
    fs.writeFileSync(path.join(tempDir, 'backend', 'Dockerfile'), backendDockerfile);

    // Frontend Release Dockerfile (Caddy-based)
    const frontendDockerfile = `# CloudBox Frontend - Production (Release)
FROM caddy:alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY dist /srv

RUN addgroup -g 1001 -S cloudbox && adduser -S cloudbox -u 1001 -G cloudbox && \\
    chown -R cloudbox:cloudbox /srv && \\
    chown -R cloudbox:cloudbox /config && \\
    chown -R cloudbox:cloudbox /data

USER cloudbox
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget -q --spider http://localhost:5000/health || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
`;
    fs.writeFileSync(path.join(tempDir, 'frontend', 'Dockerfile'), frontendDockerfile);

    // Copy frontend Caddyfile
    if (fs.existsSync(path.join(rootDir, 'frontend', 'Caddyfile'))) {
        fs.copyFileSync(
            path.join(rootDir, 'frontend', 'Caddyfile'),
            path.join(tempDir, 'frontend', 'Caddyfile')
        );
    }

    // Production environment example
    if (fs.existsSync(path.join(rootDir, '.env.production.example'))) {
        fs.copyFileSync(
            path.join(rootDir, '.env.production.example'),
            path.join(tempDir, '.env.production.example')
        );
    }

    // Step 6: Create root files
    console.log('📁 Creating release files...');

    // Create README
    const readme = `# CloudBox v${version}

## 🐳 Docker Deployment (Recommended)

### Quick Start
\`\`\`bash
cp .env.production.example .env
# Edit .env with your configuration (set passwords, FRONTEND_URL, ENCRYPTION_KEY, etc.)
docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
\`\`\`

Access:
- Frontend: http://localhost:5000
- Backend API: http://localhost:3001

### First-time Setup
After starting the containers, create the initial admin user:
\`\`\`bash
docker-compose -f docker-compose.prod.yml exec backend node dist/prisma/seed.js
\`\`\`

Optional: set RUN_MIGRATIONS_ON_START=true to run migrations on container startup.

## 📦 Manual Installation

### 1. Backend Setup
\`\`\`bash
cd backend
cp .env.example .env
# Edit .env with your database and Redis configuration
npm install --production
npm run db:migrate
npm run start
\`\`\`

### 2. Frontend Setup
\`\`\`bash
cd frontend
npm run serve
\`\`\`

Or serve the \`frontend/dist\` folder with any static file server (Caddy, nginx, etc.)

## Requirements
- Node.js >= 18
- PostgreSQL
- Redis (optional, for caching and job queues)

## Environment Variables
See \`backend/.env.example\` for all available configuration options.
For Docker deployments, see \`.env.production.example\`.
`;
    fs.writeFileSync(path.join(tempDir, 'README.md'), readme);

    // Copy root package.json
    const rootPkg = {
        name: 'cloudbox',
        version: version,
        description: 'CloudBox - Cloud Storage Platform',
        scripts: {
            'start': 'npm run start:backend',
            'start:backend': 'cd backend && npm start',
            'start:frontend': 'cd frontend && npm run serve',
            'install:all': 'cd backend && npm install --production && cd ../frontend && npm install',
            'db:migrate': 'cd backend && npm run db:migrate',
            'db:deploy': 'cd backend && npx prisma migrate deploy',
        },
        engines: { node: '>=18.0.0' },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(rootPkg, null, 2));

    // Step 7: Create ZIP
    console.log('\n📦 Creating ZIP archive...');
    await createZip(tempDir, outputZip);

    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true });

    console.log(`\n✅ Release created: ${outputZip}`);
    console.log(`   Size: ${(fs.statSync(outputZip).size / 1024 / 1024).toFixed(2)} MB\n`);
}

main().catch((err) => {
    console.error('❌ Release failed:', err);
    process.exit(1);
});
