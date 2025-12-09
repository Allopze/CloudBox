# CloudBox - Guía de Deployment

Esta guía explica cómo desplegar CloudBox en un servidor de producción usando Docker.

---

## Requisitos Previos

### Hardware Mínimo

- **CPU**: 2 cores
- **RAM**: 4 GB
- **Disco**: 20 GB SSD (más almacenamiento según necesidades)

### Software

- Docker 24+
- Docker Compose v2+
- Acceso SSH al servidor
- Dominio apuntando al servidor

---

## Deployment Rápido

### 1. Clonar el repositorio

```bash
git clone https://github.com/yourusername/cloudbox.git
cd cloudbox
```

### 2. Configurar variables de entorno

```bash
# Copiar template de producción
cp .env.production.example .env

# Editar con tus valores
nano .env
```

**Variables requeridas:**

```env
DOMAIN=cloud.example.com
FRONTEND_URL=https://cloud.example.com
POSTGRES_PASSWORD=<password-seguro>
JWT_SECRET=<generar-con-openssl>
JWT_REFRESH_SECRET=<generar-con-openssl>
```

Para generar secrets seguros:

```bash
openssl rand -base64 64
```

### 3. Iniciar servicios

```bash
# Build e iniciar en segundo plano
docker-compose -f docker-compose.prod.yml up -d --build

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f
```

### 4. Verificar deployment

```bash
# Verificar que todos los servicios estén healthy
docker-compose -f docker-compose.prod.yml ps

# Test del endpoint de salud
curl https://your-domain.com/api/health
```

---

## Arquitectura

```
                    ┌─────────────────┐
                    │     Caddy       │
                    │  (HTTPS/Proxy)  │
                    │   :80 / :443    │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
    ┌─────────────────┐           ┌─────────────────┐
    │    Frontend     │           │     Backend     │
    │  (NGINX:8080)   │           │   (Node:3001)   │
    └─────────────────┘           └────────┬────────┘
                                           │
                          ┌────────────────┴────────────────┐
                          ▼                                 ▼
                ┌─────────────────┐               ┌─────────────────┐
                │   PostgreSQL    │               │      Redis      │
                │     :5432       │               │      :6379      │
                └─────────────────┘               └─────────────────┘
```

---

## Configuración SSL

Caddy obtiene certificados SSL automáticamente de Let's Encrypt. Solo necesitas:

1. Apuntar tu dominio al servidor (DNS A record)
2. Asegurarte de que los puertos 80 y 443 estén abiertos
3. Configurar la variable `DOMAIN` en `.env`

### SSL Manual (Opcional)

Si prefieres usar tus propios certificados:

```bash
# Crear directorio para certificados
mkdir -p /etc/cloudbox/certs

# Copiar certificados
cp your-cert.pem /etc/cloudbox/certs/
cp your-key.pem /etc/cloudbox/certs/

# Modificar Caddyfile para usar certificados manuales
```

---

## Backups

### Backup de Base de Datos

```bash
# Crear backup
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U cloudbox cloudbox > backup_$(date +%Y%m%d).sql

# Restaurar backup
docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U cloudbox cloudbox < backup_20241208.sql
```

### Backup de Archivos

```bash
# Los archivos están en el volumen cloudbox_data
docker run --rm -v cloudbox_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/files_$(date +%Y%m%d).tar.gz /data
```

### Script de Backup Automático

Crear `/etc/cron.daily/cloudbox-backup`:

```bash
#!/bin/bash
BACKUP_DIR=/opt/backups/cloudbox
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR

# Database
docker-compose -f /opt/cloudbox/docker-compose.prod.yml exec -T postgres \
  pg_dump -U cloudbox cloudbox | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Files
docker run --rm -v cloudbox_cloudbox_data:/data -v $BACKUP_DIR:/backup \
  alpine tar czf /backup/files_$DATE.tar.gz /data

# Eliminar backups antiguos (mantener 7 días)
find $BACKUP_DIR -mtime +7 -delete
```

---

## Actualización

```bash
cd /opt/cloudbox

# Pull cambios
git pull origin main

# Rebuild y restart
docker-compose -f docker-compose.prod.yml up -d --build

# Ejecutar migraciones (automático en startup)
docker-compose -f docker-compose.prod.yml logs backend
```

---

## Monitoreo

### Logs

```bash
# Todos los servicios
docker-compose -f docker-compose.prod.yml logs -f

# Servicio específico
docker-compose -f docker-compose.prod.yml logs -f backend

# Últimas 100 líneas
docker-compose -f docker-compose.prod.yml logs --tail=100 backend
```

### Health Checks

```bash
# Estado de contenedores
docker-compose -f docker-compose.prod.yml ps

# Health del backend
curl -s https://your-domain.com/api/health | jq
```

### Métricas

El endpoint `/api/health` devuelve:

- Estado de base de datos
- Estado de Redis
- Uso de memoria
- Colas de procesamiento

---

## Troubleshooting

### El sitio no carga

1. Verificar que los contenedores estén corriendo:

   ```bash
   docker-compose -f docker-compose.prod.yml ps
   ```

2. Revisar logs de Caddy:

   ```bash
   docker-compose -f docker-compose.prod.yml logs caddy
   ```

3. Verificar DNS:

   ```bash
   dig your-domain.com
   ```

### Error de conexión a base de datos

1. Verificar que PostgreSQL esté healthy:

   ```bash
   docker-compose -f docker-compose.prod.yml exec postgres pg_isready
   ```

2. Verificar credenciales en `.env`

### Uploads fallan

1. Verificar espacio en disco:

   ```bash
   df -h
   ```

2. Verificar permisos del volumen:

   ```bash
   docker-compose -f docker-compose.prod.yml exec backend ls -la /app/data
   ```

### Lentitud en transcodificación

1. Verificar uso de CPU:

   ```bash
   docker stats
   ```

2. Ajustar concurrencia en variables de entorno:

   ```env
   TRANSCODING_BULL_CONCURRENCY=1
   ```

---

## Seguridad Adicional

### Firewall (UFW)

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### Fail2ban

Instalar fail2ban para protección contra ataques de fuerza bruta.

### Actualizaciones de Seguridad

```bash
# Actualizar imágenes base
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# Auditar dependencias
cd backend && npm audit
cd frontend && npm audit
```

---

## Variables de Entorno

| Variable | Requerida | Default | Descripción |
|----------|-----------|---------|-------------|
| `DOMAIN` | ✅ | - | Dominio para SSL |
| `FRONTEND_URL` | ✅ | - | URL completa del frontend |
| `POSTGRES_PASSWORD` | ✅ | - | Contraseña de PostgreSQL |
| `JWT_SECRET` | ✅ | - | Secret para access tokens |
| `JWT_REFRESH_SECRET` | ✅ | - | Secret para refresh tokens |
| `REDIS_PASSWORD` | ❌ | - | Contraseña de Redis |
| `MAX_FILE_SIZE` | ❌ | 104857600 | Tamaño máximo de archivo (bytes) |
| `DEFAULT_QUOTA` | ❌ | 5368709120 | Cuota por defecto (bytes) |
| `SMTP_*` | ❌ | - | Configuración de email |

---

## Soporte

Para reportar problemas o solicitar ayuda:

1. Revisar logs y esta documentación
2. Buscar issues existentes en GitHub
3. Crear nuevo issue con:
   - Versión de CloudBox
   - Logs relevantes
   - Pasos para reproducir
