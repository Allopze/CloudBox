# CloudBox Testing Guide

Guide for running, writing, and maintaining tests in CloudBox.

---

## Overview

CloudBox uses **Vitest** for backend testing. Tests are located in `backend/src/__tests__/`.

**Test Categories:**
- Unit tests (services, utilities)
- Integration tests (API endpoints requiring running server)

---

## Running Tests

### Quick Commands

```bash
# Run all backend tests
cd backend && npm test

# Run with watch mode
cd backend && npm test -- --watch

# Run specific test file
cd backend && npm test -- auth.test.ts

# Run with coverage report
cd backend && npm test -- --coverage
```

### From Project Root

```bash
# Uses npm workspace command
npm run test:backend
```

---

## Test Structure

```
backend/src/__tests__/
├── auth.test.ts              # Authentication tests
├── files.test.ts             # File operations tests
├── folders.test.ts           # Folder operations tests
├── shares.test.ts            # Sharing functionality tests
├── storage.test.ts           # Storage utilities tests
└── upload.integration.test.ts # Full upload integration tests
```

---

## Test Configuration

Tests are configured in `backend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

---

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MyService', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should do something', async () => {
    const result = await myFunction();
    expect(result).toBe(expected);
  });
});
```

### Mocking Prisma

```typescript
import { vi } from 'vitest';
import prisma from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    // ... other models
  },
}));

// In your test
vi.mocked(prisma.user.findUnique).mockResolvedValue({
  id: 'test-id',
  email: 'test@example.com',
  // ...
});
```

### Mocking External Services

```typescript
// Mock Redis
vi.mock('../lib/cache', () => ({
  getCache: vi.fn(() => null),
  setCache: vi.fn(),
  invalidateUser: vi.fn(),
}));

// Mock file system
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));
```

---

## Test Examples

### Testing Authentication

```typescript
import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { hashPassword, verifyPassword } from '../lib/auth';

describe('Password Hashing', () => {
  it('should hash password correctly', async () => {
    const password = 'testPassword123';
    const hash = await hashPassword(password);
    
    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$2[ab]\$\d+\$/);
  });

  it('should verify correct password', async () => {
    const password = 'testPassword123';
    const hash = await bcrypt.hash(password, 10);
    
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });
});
```

### Testing File Operations

```typescript
import { describe, it, expect, vi } from 'vitest';
import { sanitizeFilename, getFileExtension } from '../lib/storage';

describe('Storage Utils', () => {
  describe('sanitizeFilename', () => {
    it('should remove path traversal attempts', () => {
      expect(sanitizeFilename('../secret/file.txt')).toBe('file.txt');
      expect(sanitizeFilename('..\\..\\windows\\system32')).not.toContain('..');
    });

    it('should keep valid filenames unchanged', () => {
      expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
      expect(sanitizeFilename('my-file_2024.docx')).toBe('my-file_2024.docx');
    });
  });
});
```

---

## Integration Tests

Integration tests require a running server. They test full request/response cycles.

### Setup

```typescript
// upload.integration.test.ts
const TEST_API_URL = process.env.TEST_API_URL || 'http://localhost:3001';

describe('Upload Integration', () => {
  let authToken: string;

  beforeAll(async () => {
    // Login to get token
    const response = await fetch(`${TEST_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'testpassword',
      }),
    });
    const data = await response.json();
    authToken = data.accessToken;
  });

  it('should upload a file', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['test content']), 'test.txt');

    const response = await fetch(`${TEST_API_URL}/api/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });

    expect(response.ok).toBe(true);
  });
});
```

### Running Integration Tests

```bash
# Start the server first
npm run dev

# In another terminal, run tests
cd backend && npm test -- upload.integration.test.ts
```

---

## Test Database

For integration tests, use a separate test database:

```bash
# Create test database
createdb cloudbox_test

# Use different DATABASE_URL
DATABASE_URL="postgresql://user:pass@localhost:5432/cloudbox_test" npm test
```

---

## Coverage Report

Generate coverage report:

```bash
cd backend && npm test -- --coverage
```

View HTML report at `backend/coverage/index.html`.

**Coverage Goals:**
| Category | Target |
|----------|--------|
| Statements | 70% |
| Branches | 60% |
| Functions | 70% |
| Lines | 70% |

---

## CI/CD Testing

Tests run automatically in GitHub Actions (`.github/workflows/ci.yml`):

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: cloudbox_test
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
```

---

## Best Practices

### ✅ Do

- Write tests for new features before merging
- Mock external services (database, Redis, file system)
- Use descriptive test names
- Test error cases, not just happy paths
- Clean up test data after tests

### ❌ Don't

- Depend on test execution order
- Use real external services in unit tests
- Leave console.log in tests
- Skip flaky tests without fixing them

---

## Debugging Tests

```bash
# Run with verbose output
cd backend && npm test -- --reporter=verbose

# Run single test with debugging
cd backend && node --inspect-brk node_modules/.bin/vitest run auth.test.ts
```

---

## Future Improvements

- [ ] Add E2E tests with Playwright
- [ ] Frontend component tests with React Testing Library
- [ ] API contract tests
- [ ] Performance/load testing
