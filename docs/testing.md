# CloudBox Testing Guide

Guide for running, writing, and maintaining tests in CloudBox.

---

## Overview

CloudBox uses **Vitest** for backend testing. Tests are located in `backend/src/__tests__/`.

**Test Categories:**
- Unit tests (services, utilities)
- Integration tests (API endpoints requiring a running server)

---

## Running Tests

### Quick Commands (Backend)

```bash
# Run all backend tests
cd backend && npm test

# Run with watch mode
cd backend && npm run test:watch

# Run specific test file
cd backend && npm test -- auth.test.ts

# Run with coverage report
cd backend && npm run test:coverage
```

### From Project Root

```bash
npm run test:backend
```

### Integration Tests

Integration tests require a running backend server (they hit real HTTP endpoints). They are skipped by default unless `RUN_INTEGRATION=1`.

```bash
# Terminal 1: start backend (or use `npm run dev:backend` from repo root)
cd backend && npm run dev

# Terminal 2: run only the integration suite
cd backend && npm run test:integration
```

**Optional env vars:**
- `TEST_API_URL` (default: `http://localhost:3001`)

---

## Test Structure

```
backend/src/__tests__/
├── auth.test.ts               # Authentication tests
├── files.test.ts              # File operations tests
├── folders.test.ts            # Folder operations tests
├── shares.test.ts             # Sharing functionality tests
├── storage.test.ts            # Storage utilities tests
└── upload.integration.test.ts # Full upload integration tests (requires server)
```

---

## Test Configuration

Tests are configured in `backend/vitest.config.ts`.

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
import prisma from '../lib/prisma.js';

vi.mock('../lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
```

### Mocking External Services

```typescript
// Mock Redis cache helpers
vi.mock('../lib/cache.js', () => ({
  getCache: vi.fn(() => null),
  setCache: vi.fn(),
  invalidateUser: vi.fn(),
}));
```

---

## Integration Tests

Integration tests verify full request/response cycles against a real server.

### Example

```typescript
const TEST_API_URL = process.env.TEST_API_URL || 'http://localhost:3001';

describe('Upload Integration', () => {
  // ...
});
```

---

## CI/CD

`npm test` runs unit tests. Integration tests are skipped unless explicitly enabled (for example, `RUN_INTEGRATION=1`).

---

## Best Practices

### Do

- Write tests for new features before merging
- Mock external services (Redis, email, filesystem) in unit tests
- Use descriptive test names
- Test error cases, not just happy paths

### Don't

- Depend on test execution order
- Use real external services in unit tests
- Leave `console.log` in committed tests
- Skip flaky tests without addressing the cause

