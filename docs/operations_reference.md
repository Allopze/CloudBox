# CloudBox - Referencia Operacional

Guía consolidada de puertos, servicios, variables de entorno, checklist de producción, troubleshooting y roadmap.

---

## 1. Puertos y Servicios

| Servicio | Puerto | Propósito | Health Check |
|----------|--------|-----------|--------------|
| **Backend API** | `3001` | API REST principal | `/api/health/ping` |
| **Frontend (Caddy)** | `5000` | UI + proxy reverso a API | `/health` |
| **PostgreSQL** | `5432` (interno) | Base de datos principal | `pg_isready` |
| **Redis** | `6379` (interno) | Cache, rate limiting, colas | `redis-cli ping` |
| **Worker** | - (sin puerto) | Transcodificación, thumbnails | - |
| **GlitchTip** | `8000` | Error tracking (opcional) | `/_health/` |

> **Nota**: Solo los puertos `3001`, `5000` y `8000` están expuestos externamente. PostgreSQL y Redis son exclusivamente internos.

### Arquitectura de Red

```
Internet
    │
    ▼
Cloudflare Tunnel (HTTPS)
    │
    ├──► Frontend (Caddy) :5000
    │        │
    │        └──► /api/* proxy ──► Backend :3001
    │
    └──► Backend API :3001 (opcional, acceso directo)

Red Interna (cloudbox-internal):
    ├── postgres:5432
    ├── redis:6379
    ├── backend:3001
    ├── worker (sin puerto)
    ├── frontend:5000
    └── glitchtip:8000 (opcional)
```

---

## 2. Variables de Entorno

### 2.1 Obligatorias (producción falla sin estas)

| Variable | Descripción | Cómo Generar |
|----------|-------------|--------------|
| `FRONTEND_URL` | URL completa con `https://` | Manual (ej: `https://cloud.example.com`) |
| `POSTGRES_PASSWORD` | Contraseña PostgreSQL | `openssl rand -base64 24` |
| `JWT_SECRET` | Secret para access tokens (≥32 chars) | `openssl rand -base64 64` |
| `JWT_REFRESH_SECRET` | Secret para refresh tokens (≥32 chars) | `openssl rand -base64 64` |
| `ENCRYPTION_KEY` | Cifrado de datos sensibles (≥32 chars) | `openssl rand -base64 32` |

### 2.2 Recomendadas (funcionalidad reducida sin estas)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `REDIS_PASSWORD` | - | Contraseña para Redis |
| `SENTRY_DSN` | - | DSN para error tracking (GlitchTip/Sentry) |
| `SMTP_HOST` | - | Servidor SMTP |
| `SMTP_PORT` | `587` | Puerto SMTP |
| `SMTP_USER` | - | Usuario SMTP |
| `SMTP_PASS` | - | Contraseña SMTP |
| `SMTP_FROM` | - | Dirección de envío |
| `GOOGLE_CLIENT_ID` | - | OAuth Google |
| `GOOGLE_CLIENT_SECRET` | - | OAuth Google |

### 2.3 Opcionales (tienen defaults sensatos)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Entorno: `development`, `production`, `test` |
| `PORT` | `3001` | Puerto del backend |
| `JWT_EXPIRES_IN` | `15m` | Expiración access token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Expiración refresh token |
| `MAX_FILE_SIZE` | `1073741824` (1GB) | Tamaño máximo de archivo en bytes |
| `DEFAULT_QUOTA` | `5368709120` (5GB) | Cuota por usuario en bytes |
| `TRASH_RETENTION_DAYS` | `30` | Días antes de eliminar archivos de papelera |
| `WORKER_CONCURRENCY` | `2` | Concurrencia de workers |
| `WORKER_TYPE` | `all` | Tipo: `all`, `transcoding`, `thumbnails` |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Configuración de proxies confiables |

### 2.4 GlitchTip (si usas error tracking)

| Variable | Descripción |
|----------|-------------|
| `GLITCHTIP_DB_PASSWORD` | Contraseña PostgreSQL de GlitchTip |
| `GLITCHTIP_SECRET_KEY` | Secret key para GlitchTip (≥32 chars) |
| `GLITCHTIP_DOMAIN` | URL de GlitchTip (ej: `http://localhost:8000`) |

### 2.5 WOPI (edición de Office)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `WOPI_ENABLED` | `false` | Habilitar integración WOPI |
| `WOPI_EDIT_ENABLED` | `false` | Habilitar edición (no solo lectura) |
| `WOPI_DISCOVERY_URL` | - | URL del discovery XML del cliente WOPI |
| `WOPI_TOKEN_TTL_SECONDS` | `900` | TTL de tokens WOPI |

---

## 3. Checklist de Producción

### 3.1 Seguridad (Obligatorio)

- [ ] Generar secrets únicos con `openssl rand -base64 64`
- [ ] Establecer `NODE_ENV=production`
- [ ] Configurar HTTPS (Cloudflare Tunnel recomendado)
- [ ] `ADMIN_PASSWORD` ≥12 caracteres
- [ ] Configurar `FRONTEND_URL` correctamente (con `https://`)
- [ ] `.env` NO está en control de versiones
- [ ] CORS restringido a dominios propios

### 3.2 TLS/HTTPS

- [ ] Cloudflare Tunnel configurado **O** certificados SSL instalados
- [ ] HSTS habilitado (automático con Caddy)
- [ ] Cookies con `secure: true` (automático en producción)

### 3.3 Backups

```bash
# Backup PostgreSQL (ejecutar diariamente)
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U cloudbox cloudbox > backup_$(date +%Y%m%d).sql

# Backup de archivos
tar czf files_$(date +%Y%m%d).tar.gz ./data/cloudbox

# Cron recomendado (añadir a crontab)
0 3 * * * /opt/cloudbox/scripts/backup.sh /backups
```

### 3.4 Infraestructura

- [ ] Redis habilitado para rate limiting distribuido
- [ ] Data volumes fuera del repo (ej: `/var/lib/cloudbox`)
- [ ] Límites de recursos en containers (CPU/RAM)
- [ ] Firewall configurado (solo puertos 80, 443, 22 expuestos)
- [ ] Acceso a PostgreSQL y Redis restringido a red interna

### 3.5 Monitoreo

- [ ] GlitchTip/Sentry configurado (`SENTRY_DSN`)
- [ ] Health checks monitoreados con alertas
- [ ] Logs centralizados
- [ ] Métricas de colas (latencia, fallos)

---

## 4. Troubleshooting

### 4.1 Problemas de Inicio

#### Error: `EADDRINUSE: address already in use`

Otro proceso está usando el puerto 3001 o 5000.

```bash
# Windows
netstat -ano | findstr :3001

# Linux/Mac
lsof -i :3001

# Solución: matar el proceso o usar otro puerto
PORT=3002 npm run dev
```

#### Error: `JWT secret not configured`

Usando secrets por defecto en producción.

```bash
# Generar secrets seguros
openssl rand -base64 64

# Añadir a .env
JWT_SECRET=<tu-secret-generado>
JWT_REFRESH_SECRET=<otro-secret-generado>
```

#### Error: `Cannot find module`

Dependencias no instaladas o corruptas.

```bash
rm -rf node_modules package-lock.json
rm -rf backend/node_modules frontend/node_modules
npm run install:all
```

### 4.2 Problemas de Base de Datos

#### Error: `ECONNREFUSED` a PostgreSQL

```bash
# Iniciar PostgreSQL
docker-compose up -d postgres

# Verificar conexión
docker-compose exec postgres pg_isready -U cloudbox

# Verificar DATABASE_URL en .env
DATABASE_URL="postgresql://cloudbox:password@localhost:5432/cloudbox"
```

#### Error: `Prisma client not generated`

```bash
cd backend && npx prisma generate
```

#### Error: `Migration failed`

```bash
# Resetear DB (⚠️ borra todos los datos)
cd backend && npx prisma migrate reset

# O push schema sin migración
cd backend && npx prisma db push
```

### 4.3 Problemas de Redis

#### Error: `ECONNREFUSED` a Redis

```bash
# Iniciar Redis
docker-compose up -d redis

# La app funciona sin Redis pero con funcionalidad limitada:
# - Rate limiting solo por instancia
# - Sesiones no persisten entre reinicios
```

### 4.4 Problemas de Uploads

#### Uploads fallan con archivos grandes

```bash
# Aumentar límite en .env
MAX_FILE_SIZE=1073741824  # 1GB

# Verificar espacio en disco
df -h /path/to/storage
```

#### Error: `Quota exceeded`

- Eliminar archivos innecesarios
- Vaciar papelera
- Solicitar aumento de cuota al admin

### 4.5 Problemas de Media Processing

#### Thumbnails no se generan

```bash
# Instalar GraphicsMagick
# Ubuntu/Debian
sudo apt-get install graphicsmagick

# macOS
brew install graphicsmagick

# Windows
choco install graphicsmagick
```

#### Videos no transcodifican

```bash
# Instalar FFmpeg
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Verificar
ffmpeg -version
```

#### PDF Preview no funciona

```bash
# Instalar LibreOffice
# Ubuntu/Debian
sudo apt-get install libreoffice

# macOS
brew install --cask libreoffice

# Verificar
soffice --version
```

### 4.6 Problemas de Frontend

#### CORS / API Errors

Verificar que `FRONTEND_URL` en backend coincide exactamente con la URL del frontend:

```bash
# Desarrollo
FRONTEND_URL=http://localhost:5000

# Producción
FRONTEND_URL=https://cloud.example.com
```

#### Login no funciona

1. Verificar HTTPS en producción
2. Verificar cookies de terceros habilitadas en navegador
3. Verificar `FRONTEND_URL` coincide exactamente (incluyendo puerto)

### 4.7 Problemas de Docker

#### Permission denied en volumes

```bash
# Arreglar permisos
sudo chown -R 1001:1001 ./data

# O crear volume de Docker
docker volume create cloudbox_data
```

#### Container no inicia

```bash
# Ver logs
docker-compose -f docker-compose.prod.yml logs backend
docker-compose -f docker-compose.prod.yml logs frontend
```

### 4.8 Debug Logging

```bash
# Backend con debug
LOG_LEVEL=debug npm run dev

# Ver logs en Docker
docker-compose -f docker-compose.prod.yml logs -f backend

# Frontend (en consola del navegador)
localStorage.setItem('debug', 'cloudbox:*');
```

### 4.9 Referencia Rápida

| Problema | Solución Rápida |
|----------|-----------------|
| Puerto en uso | `PORT=3002 npm run dev` |
| DB no conecta | `docker-compose up -d postgres` |
| Redis falta | App funciona sin él (limitado) |
| Prisma error | `cd backend && npx prisma generate` |
| Deps faltan | `npm run install:all` |
| Thumbnails | Instalar GraphicsMagick |
| Video transcode | Instalar FFmpeg |
| PDF preview | Instalar LibreOffice |
| Archives | Instalar 7-Zip |

---

## 5. Roadmap Corto

Basado en el audit de producción:

| Hito | Prioridad | Descripción | Estado |
|------|-----------|-------------|--------|
| **M1** | 🔴 Crítica | Rotar secrets y sacar `.env` del repo | Pendiente |
| **M2** | 🔴 Alta | Separar migraciones del startup del container | Pendiente |
| **M3** | 🟠 Media | Exigir Redis para document conversion en producción | Pendiente |
| **M4** | 🟠 Media | Implementar lock distribuido para cleanup de chunks | Pendiente |
| **M5** | 🟢 Baja | Restringir CSP headers (eliminar wildcards http:/https:) | Pendiente |

### Acciones Inmediatas

1. **Secrets**: Rotar todos los credentials y generar nuevos con `openssl rand`
2. **Migrations**: Mover a job separado o step de CI/CD
3. **Data Path**: Mover `./data` fuera del repo a `/var/lib/cloudbox`
4. **Redis**: Hacer obligatorio para colas de procesamiento

---

## 6. Enlaces a Documentación

| Documento | Descripción |
|-----------|-------------|
| [Getting Started](./getting_started.md) | Setup inicial y desarrollo |
| [Environment Variables](./environment_variables.md) | Referencia completa de ENV |
| [Deployment](./deployment.md) | Guía de Docker Compose |
| [Security Hardening](./security_hardening.md) | Checklist de seguridad |
| [Backup & Restore](./backup.md) | Procedimientos de backup |
| [Troubleshooting](./troubleshooting.md) | Problemas comunes |
| [API Overview](./api_overview.md) | Referencia REST API |
| [Admin API](./admin_api.md) | Endpoints de administración |
| [Queues](./queues.md) | Bull/Redis queues |
| [WebSockets](./websockets.md) | Eventos en tiempo real |
| [WOPI](./wopi.md) | Integración Office editing |
| [Architecture](./architecture.md) | Diseño del sistema |
| [Database Schema](./database_schema.md) | Modelos de datos |

---

## 7. Comandos Útiles

```bash
# Desarrollo
npm run dev                    # Iniciar frontend + backend
npm run setup                  # Migrations + seed

# Base de datos
cd backend && npm run db:studio   # Prisma Studio
cd backend && npx prisma migrate dev  # Nueva migración

# Producción
docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml logs -f backend
docker-compose -f docker-compose.prod.yml exec backend npm run db:seed

# Health checks
curl http://localhost:3001/api/health/ping
curl http://localhost:5000/health

# Backups
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U cloudbox cloudbox > backup.sql
```

---

*Última actualización: 2026-01-16*
