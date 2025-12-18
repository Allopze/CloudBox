# CloudBox Admin API

Reference documentation for the Admin API endpoints under `/api/admin`. All endpoints require authentication and `ADMIN` role.

## Rate Limiting

Admin endpoints are protected with rate limiting:
- **60 requests per minute per IP** for public endpoints (branding, landing assets)

---

## Users Management

### List Users
```http
GET /admin/users
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number for pagination |
| `limit` | number | 20 | Items per page (max: 100) |
| `search` | string | - | Search by name or email |

**Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "USER",
      "avatar": "/api/users/avatar/uuid",
      "emailVerified": true,
      "storageQuota": "5368709120",
      "storageUsed": "1234567890",
      "maxFileSize": "104857600",
      "createdAt": "2025-01-01T00:00:00Z",
      "_count": { "files": 42, "folders": 10 }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

### Get User
```http
GET /admin/users/:id
```

**Response:** Single user object (same structure as list)

---

### Create User
```http
POST /admin/users
```

**Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe",
  "role": "USER",
  "storageQuota": "10737418240",
  "maxFileSize": "209715200"
}
```

**Fields:**
| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `email` | ✅ | - | User email (must be unique) |
| `password` | ✅ | - | User password |
| `name` | ✅ | - | Display name |
| `role` | ❌ | `USER` | `USER` or `ADMIN` |
| `storageQuota` | ❌ | 5GB | Storage quota in bytes |
| `maxFileSize` | ❌ | 100MB | Max file size in bytes |

---

### Update User
```http
PATCH /admin/users/:id
```

**Body:** Same fields as create, all optional

---

### Delete User
```http
DELETE /admin/users/:id
```

> ⚠️ Cannot delete your own admin account

Deletes user and all their files from storage.

---

## Storage Requests

### List Requests
```http
GET /admin/storage-requests
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by `PENDING`, `APPROVED`, or `REJECTED` |

---

### Get Pending Count
```http
GET /admin/storage-requests/count
```

**Response:**
```json
{ "count": 5 }
```

---

### Approve Request
```http
POST /admin/storage-requests/:id/approve
```

**Body:**
```json
{ "adminResponse": "Quota approved for your project needs" }
```

Updates user's `storageQuota` to the requested amount.

---

### Reject Request
```http
POST /admin/storage-requests/:id/reject
```

**Body:**
```json
{ "adminResponse": "Please provide more justification" }
```

---

## Branding

### Upload Branding
```http
POST /admin/branding/:type
Content-Type: multipart/form-data
```

**Types:** `logo-light`, `logo-dark`, `favicon`

**Formats Supported:**
- SVG (stored as-is)
- PNG, JPG, WebP, GIF (resized and converted)

**Processing:**
- Logos: Resized to max 800x200px
- Favicon: Resized to 32x32px

---

### Get Branding (Public)
```http
GET /admin/branding/:type
```

Returns the branding image with appropriate `Content-Type`.

---

### Delete Branding
```http
DELETE /admin/branding/:type
```

---

## Landing Assets

### Upload Landing Asset
```http
POST /admin/landing/assets/:type
Content-Type: multipart/form-data
```

**Types:** `hero`, `feature`

---

### Get Landing Asset (Public)
```http
GET /admin/landing/assets/:type
```

---

### Delete Landing Asset
```http
DELETE /admin/landing/assets/:type
```

---

## SMTP Configuration

### Get SMTP Config
```http
GET /admin/smtp
```

**Response:**
```json
{
  "host": "smtp.example.com",
  "port": "587",
  "secure": "false",
  "user": "user@example.com",
  "from": "CloudBox <noreply@example.com>"
}
```

> Note: Password is never returned

---

### Save SMTP Config
```http
POST /admin/smtp
```

**Body:**
```json
{
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "user": "user@example.com",
  "pass": "smtp_password",
  "from": "CloudBox <noreply@example.com>"
}
```

Password is encrypted before storage.

---

### Test SMTP Connection
```http
POST /admin/smtp/test
```

**Response:**
```json
{ "connected": true }
```

---

### Send Test Email
```http
POST /admin/smtp/send-test
```

**Body:**
```json
{ "email": "recipient@example.com" }
```

---

## Upload Limits

### Get Limits
```http
GET /admin/settings/limits
```

**Response:**
```json
{
  "maxFileSize": "104857600",
  "chunkSize": "20971520",
  "concurrentChunks": "4"
}
```

---

### Save Limits
```http
PUT /admin/settings/limits
```

**Body:**
```json
{
  "maxFileSize": "209715200",
  "chunkSize": "20971520",
  "concurrentChunks": "6"
}
```

**Constraints:**
- `maxFileSize`: Min 1MB
- `chunkSize`: 1MB - configured max
- `concurrentChunks`: 1 - 10

---

## Email Templates

### List Templates
```http
GET /admin/email-templates
```

---

### Get Template
```http
GET /admin/email-templates/:name
```

**Built-in Templates:** `welcome`, `reset_password`

---

### Update Template
```http
PUT /admin/email-templates/:name
```

**Body:**
```json
{
  "subject": "Welcome to {{appName}}, {{name}}!",
  "body": "<h1>Welcome!</h1><p>Click <a href=\"{{verifyUrl}}\">here</a> to verify.</p>"
}
```

---

### Reset Template
```http
DELETE /admin/email-templates/:name
```

Resets template to default.

---

### Send Test Template
```http
POST /admin/email-templates/:name/test
```

**Body:**
```json
{ "email": "test@example.com" }
```

---

### Template Variables

#### Get Variables
```http
GET /admin/email-templates/:name/variables
```

**System Variables:**
| Variable | Description |
|----------|-------------|
| `{{name}}` | User's name |
| `{{email}}` | User's email |
| `{{appName}}` | Application name |
| `{{appUrl}}` | Application URL |
| `{{date}}` | Current date |
| `{{verifyUrl}}` | Email verification URL (welcome) |
| `{{resetUrl}}` | Password reset URL (reset_password) |

---

#### Add Custom Variable
```http
POST /admin/email-templates/:name/variables
```

**Body:**
```json
{
  "name": "customField",
  "defaultValue": "Default text",
  "description": "Optional description"
}
```

---

#### Update Custom Variable
```http
PUT /admin/email-templates/:name/variables/:variableId
```

---

#### Delete Custom Variable
```http
DELETE /admin/email-templates/:name/variables/:variableId
```

---

## Server Info

### Get Server Info
```http
GET /admin/server-info
```

**Response:**
```json
{
  "hostname": "server-1",
  "platform": "linux",
  "arch": "x64",
  "cpus": 4,
  "memory": {
    "total": 8589934592,
    "free": 4294967296,
    "used": 4294967296
  },
  "uptime": 86400,
  "nodeVersion": "v20.10.0",
  "port": 3001,
  "frontendUrl": "https://cloud.example.com",
  "stats": {
    "users": 150,
    "files": 10000,
    "folders": 500,
    "totalStorage": "107374182400"
  }
}
```

---

## Settings

### Get Branding Settings (Public)
```http
GET /admin/settings/branding
```

Returns customizable branding colors and URLs.

---

### Get General Settings
```http
GET /admin/settings
```

Returns all application settings (admin only).

---

### Update Settings
```http
PUT /admin/settings
```

**Body:**
```json
{
  "site_name": "My CloudBox",
  "branding_primary_color": "#dc2626",
  "registration_enabled": "true",
  "require_email_verification": "true"
}
```

---

## Legal Pages

### List Legal Pages
```http
GET /admin/legal-pages
```

---

### Get Legal Page
```http
GET /admin/legal-pages/:slug
```

**Slugs:** `privacy`, `terms`

---

### Update Legal Page
```http
PUT /admin/legal-pages/:slug
```

**Body:**
```json
{
  "title": "Privacy Policy",
  "content": "# Privacy Policy\n\nYour content in Markdown...",
  "isActive": true
}
```

---

## Health Check

### Admin Health
```http
GET /admin/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

---

## Error Responses

All endpoints return errors in consistent format:

```json
{
  "error": "Error message describing the issue"
}
```

**Common Status Codes:**
| Code | Description |
|------|-------------|
| 400 | Bad request / Validation error |
| 401 | Not authenticated |
| 403 | Not authorized (not admin) |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
