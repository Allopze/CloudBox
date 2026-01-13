# WOPI Host Integration

CloudBox includes a built-in WOPI (Web Application Open Platform Interface) Host, allowing users to open and edit Office documents directly in the browser using external WOPI clients like Collabora Online, OnlyOffice, or LibreOffice Online.

## Overview

- **CloudBox** acts as the **WOPI Host** (storage + permissions)
- **WOPI Client** (Collabora, OnlyOffice, etc.) provides the editor UI
- Documents are opened in an iframe via the host page at `/office/open/{fileId}`

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable WOPI integration
WOPI_ENABLED=true

# Enable edit mode (requires Redis for locks)
WOPI_EDIT_ENABLED=true

# Public URL where WOPI client can reach CloudBox
CLOUDBOX_PUBLIC_URL=https://cloudbox.example.com

# WOPI Client discovery URL
WOPI_DISCOVERY_URL=https://collabora.example.com/hosting/discovery

# Allowed iframe origins for CSP (comma-separated)
OFFICE_ALLOWED_IFRAME_ORIGINS=https://collabora.example.com

# Token TTL in seconds (default: 900 = 15 minutes)
WOPI_TOKEN_TTL_SECONDS=900

# Lock TTL in seconds (default: 1800 = 30 minutes)
WOPI_LOCK_TTL_SECONDS=1800

# Lock provider: 'db' (default) or 'redis'
WOPI_LOCK_PROVIDER=db

# Max file size for WOPI operations (default: 100MB)
MAX_WOPI_FILE_SIZE_BYTES=104857600

# Optional: Separate secret for WOPI tokens
WOPI_TOKEN_SECRET=your-wopi-secret-key

# Optional: Verify WOPI proof keys (if client supports)
WOPI_PROOF_KEYS_VERIFY=false
```

### Minimal Setup (View Only)

```bash
WOPI_ENABLED=true
CLOUDBOX_PUBLIC_URL=https://cloudbox.example.com
WOPI_DISCOVERY_URL=https://collabora.example.com/hosting/discovery
OFFICE_ALLOWED_IFRAME_ORIGINS=https://collabora.example.com
```

### Full Setup (View + Edit)

```bash
WOPI_ENABLED=true
WOPI_EDIT_ENABLED=true
CLOUDBOX_PUBLIC_URL=https://cloudbox.example.com
WOPI_DISCOVERY_URL=https://collabora.example.com/hosting/discovery
OFFICE_ALLOWED_IFRAME_ORIGINS=https://collabora.example.com
WOPI_LOCK_PROVIDER=redis  # Recommended for edit mode
```

## WOPI Clients

### Collabora Online

1. Deploy Collabora Online (CODE):
   ```bash
   docker run -t -d -p 9980:9980 \
     -e "domain=cloudbox\\.example\\.com" \
     -e "username=admin" \
     -e "password=secret" \
     --cap-add MKNOD \
     collabora/code
   ```

2. Set discovery URL:
   ```
   WOPI_DISCOVERY_URL=https://collabora.example.com:9980/hosting/discovery
   ```

### OnlyOffice

1. Deploy OnlyOffice Document Server:
   ```bash
   docker run -i -t -d -p 80:80 onlyoffice/documentserver
   ```

2. Set discovery URL:
   ```
   WOPI_DISCOVERY_URL=https://onlyoffice.example.com/hosting/discovery
   ```

## Endpoints

### WOPI Protocol Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/wopi/files/{fileId}` | GET | CheckFileInfo - Get file metadata |
| `/wopi/files/{fileId}/contents` | GET | GetFile - Download file content |
| `/wopi/files/{fileId}/contents` | POST | PutFile - Save file content |
| `/wopi/files/{fileId}` | POST | Lock operations (LOCK, UNLOCK, etc.) |

### Host Page

| Endpoint | Description |
|----------|-------------|
| `/office/open/{fileId}?mode=view` | Open file in view mode |
| `/office/open/{fileId}?mode=edit` | Open file in edit mode |
| `/office/supported` | Get list of supported extensions |

## Troubleshooting

### Common Issues

**"Office integration is not enabled"**
- Check `WOPI_ENABLED=true` is set

**"Office editor is not configured"**
- Check `WOPI_DISCOVERY_URL` points to your WOPI client's discovery endpoint

**"File type not supported"**
- The WOPI client doesn't support this file extension
- Check `/office/supported` for list of supported types

**Document loads but can't save**
- Enable edit mode: `WOPI_EDIT_ENABLED=true`
- For production, use Redis for locks: `WOPI_LOCK_PROVIDER=redis`

**CORS/CSP errors in browser**
- Add the WOPI client origin to `OFFICE_ALLOWED_IFRAME_ORIGINS`
- Ensure `CLOUDBOX_PUBLIC_URL` is accessible from the WOPI client

### Debugging

Enable verbose logging:
```bash
LOG_LEVEL=debug npm run dev
```

Check discovery is working:
```bash
curl -v $WOPI_DISCOVERY_URL
```

Test CheckFileInfo:
```bash
curl -H "Authorization: Bearer <token>" \
  https://cloudbox.example.com/wopi/files/<fileId>
```

## Security Considerations

1. **HTTPS Required**: Both CloudBox and WOPI client must use HTTPS in production
2. **Token Security**: WOPI tokens are short-lived (15 min default)
3. **CSP Headers**: Host page restricts iframe sources
4. **Lock Validation**: Edit operations require valid lock
5. **Permission Checks**: All requests verify file ownership/share permissions

## Production Checklist

- [ ] `WOPI_ENABLED=true`
- [ ] `CLOUDBOX_PUBLIC_URL` set to public HTTPS URL
- [ ] `WOPI_DISCOVERY_URL` points to WOPI client discovery
- [ ] `OFFICE_ALLOWED_IFRAME_ORIGINS` includes WOPI client origin
- [ ] `WOPI_TOKEN_SECRET` set (or falls back to `JWT_SECRET`)
- [ ] HTTPS enabled for both CloudBox and WOPI client
- [ ] WOPI client can reach CloudBox `/wopi/*` endpoints
- [ ] Redis configured if using `WOPI_LOCK_PROVIDER=redis`
- [ ] Firewall allows traffic between CloudBox and WOPI client
- [ ] Reverse proxy configured to pass headers correctly
