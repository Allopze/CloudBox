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
 * 
 * Output: releases/CloudBox-X.X.X.zip
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

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

    // Check for version bump argument
    const bumpType = process.argv[2]; // patch, minor, major
    if (['patch', 'minor', 'major'].includes(bumpType)) {
        const oldVersion = version;
        version = bumpVersion(version, bumpType);

        // Update package.json
        packageJson.version = version;
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

        console.log(`\n📝 Version bumped: ${oldVersion} → ${version}\n`);
    }

    const releaseName = `CloudBox-${version}`;

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

    // Step 1: Build backend
    console.log('🔨 Building backend...');
    try {
        execSync('npm run build', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });
    } catch (error) {
        console.error('❌ Backend build failed');
        process.exit(1);
    }

    // Step 2: Build frontend
    console.log('\n🔨 Building frontend...');
    try {
        execSync('npm run build', { cwd: path.join(rootDir, 'frontend'), stdio: 'inherit' });
    } catch (error) {
        console.error('❌ Frontend build failed');
        process.exit(1);
    }

    // Step 3: Copy backend files
    console.log('\n📁 Copying backend files...');
    const backendDest = path.join(tempDir, 'backend');

    // Copy compiled JS
    copyDirSync(path.join(rootDir, 'backend', 'dist'), path.join(backendDest, 'dist'));

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

    // Copy package.json (production dependencies only)
    const backendPkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'backend', 'package.json'), 'utf8'));
    delete backendPkg.devDependencies;
    backendPkg.scripts = {
        start: 'node dist/index.js',
        'db:migrate': 'npx prisma migrate deploy',
        'db:generate': 'npx prisma generate',
    };
    fs.writeFileSync(path.join(backendDest, 'package.json'), JSON.stringify(backendPkg, null, 2));

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

    // Step 5: Create root files
    console.log('📁 Creating release files...');

    // Create README
    const readme = `# CloudBox v${version}

## Quick Start

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

Or serve the \`frontend/dist\` folder with any static file server (nginx, apache, etc.)

## Requirements
- Node.js >= 18
- PostgreSQL
- Redis (optional, for caching and job queues)

## Environment Variables
See \`backend/.env.example\` for all available configuration options.
`;
    fs.writeFileSync(path.join(tempDir, 'README.md'), readme);

    // Copy root package.json
    const rootPkg = {
        name: 'cloudbox',
        version: version,
        description: 'CloudBox - Cloud Storage Platform',
        scripts: {
            'start:backend': 'cd backend && npm start',
            'start:frontend': 'cd frontend && npm run serve',
            'install:all': 'cd backend && npm install --production && cd ../frontend && npm install',
            'db:migrate': 'cd backend && npm run db:migrate',
        },
        engines: { node: '>=18.0.0' },
    };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(rootPkg, null, 2));

    // Step 6: Create ZIP
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
