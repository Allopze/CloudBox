# CloudBox - Guía de deployment

Esta guía describe cómo desplegar CloudBox con Docker usando `docker-compose.prod.yml`.

## Requisitos

- Docker 24+ y Docker Compose v2+
- Un dominio (si lo vas a exponer públicamente)
- Recomendado: Cloudflare Tunnel para HTTPS

### Hardware mínimo

- CPU: 2 cores
- RAM: 4 GB (más si haces transcodificación)
- Disco: según tu uso (volúmenes persistentes para DB y uploads)

## 1) Configurar variables de entorno

```bash
cp .env.production.example .env
```

Variables típicamente necesarias:

```env
FRONTEND_URL=https://cloud.example.com
POSTGRES_PASSWORD=...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
ENCRYPTION_KEY=...
```

Generar secrets seguros:

```bash
openssl rand -base64 64  # JWT secrets
openssl rand -base64 32  # ENCRYPTION_KEY
```

## 2) Levantar servicios

```bash
docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml ps
```

Health checks:

- Backend (público): `http://localhost:3001/api/health/ping`
- Frontend: `http://localhost:5000/health`
- Health detallado (admin): `GET /api/health` con token de `ADMIN`

## 3) Acceso LAN + WAN

CloudBox usa **Caddy** como servidor web para el frontend. Caddy escucha en el puerto `5000` y funciona tanto para acceso local como remoto:

### Acceso desde la red local (LAN)

```
http://192.168.1.100:5000   → Frontend con Caddy
http://192.168.1.100:3001   → API directa
```

### Acceso público (WAN) con Cloudflare Tunnel

Configura reglas de ingress para que:

- `https://cloud.example.com/*` → `http://localhost:5000`

> **Nota**: Caddy hace proxy automático de `/api/*` al backend, así que solo necesitas exponer el puerto 5000 al túnel.

Cloudflare maneja HTTPS en el borde. El tráfico llega a Caddy en HTTP, que es seguro dentro del túnel.

## 4) Crear el primer admin (producción)

La imagen de backend corre migraciones al arrancar, pero **no ejecuta el seed automáticamente**.

1. Define `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env` (mínimo 12 caracteres para producción).
2. Ejecuta el seed en el contenedor:

```bash
docker-compose -f docker-compose.prod.yml exec backend node dist/prisma/seed.js
```

## 5) Dependencias opcionales (features)

- Office → PDF preview requiere **LibreOffice** (`soffice`). Si no está disponible, el backend deshabilita la conversión automáticamente.
  - En Docker: extiende `backend/Dockerfile` e instala LibreOffice si quieres esta funcionalidad.

## 6) Backups

### Base de datos

Si usas los valores por defecto (`POSTGRES_USER=cloudbox`, `POSTGRES_DB=cloudbox`):

```bash
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U cloudbox cloudbox > backup_$(date +%Y%m%d).sql
```

### Archivos (uploads/thumbnails)

El volumen suele llamarse `<project>_cloudbox_data` (por ejemplo, `cloudbox_cloudbox_data`):

```bash
docker run --rm -v cloudbox_cloudbox_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/files_$(date +%Y%m%d).tar.gz /data
```

## 7) GlitchTip / Sentry (opcional)

`docker-compose.prod.yml` incluye GlitchTip (alternativa self-hosted a Sentry) y el backend/frontend soportan `SENTRY_DSN`.

- GlitchTip (local): `http://localhost:8000`
- Configura `SENTRY_DSN` en `.env` para enviar errores.

## 8) Sobre Caddy vs NGINX

El proyecto usa **Caddy** como servidor web del frontend por las siguientes razones:

| Aspecto | Caddy | NGINX |
|---------|-------|-------|
| Configuración | ~65 líneas | ~124 líneas |
| HTTPS automático | ✅ Si lo necesitas | Manual |
| HTTP/2 & HTTP/3 | Por defecto | Requiere config |
| Rendimiento | Excelente | Ligeramente mejor |

Para casos con Cloudflare Tunnel, ambos funcionan igual porque Cloudflare maneja HTTPS.



