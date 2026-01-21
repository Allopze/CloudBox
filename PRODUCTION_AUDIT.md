# PRODUCTION_AUDIT.md

A) Veredicto: NO LISTO
- Motivo: bloqueadores criticos de seguridad y datos (secrets expuestos, backups no automatizados).
- Alcance revisado: backend, frontend, Dockerfiles/compose, env, docs, rutas clave (auth, files, shares, admin), colas, storage, observabilidad.

Mapa del sistema
- Frontend SPA React/Vite servido por Caddy en :5000, proxy /api y /socket.io -> backend. Evidencia: `frontend/Dockerfile:47`, `frontend/Caddyfile:22`, `frontend/Caddyfile:39`, `docker-compose.prod.yml:198`.
- Backend API Express/TS en :3001 con JWT + refresh cookie. Evidencia: `backend/Dockerfile:71`, `backend/src/lib/jwt.ts:22`, `backend/src/routes/auth.ts:50`, `docker-compose.prod.yml:135`.
- Worker Bull separado (transcoding, thumbnails, document conversion). Evidencia: `backend/package.json:11`, `docker-compose.prod.yml:146`, `backend/src/lib/transcodingQueue.ts:17`, `backend/src/lib/thumbnailQueue.ts:1`, `backend/src/lib/documentConversionQueue.ts:11`.
- Postgres 16 y Redis 7. Evidencia: `docker-compose.prod.yml:41`, `docker-compose.prod.yml:64`.
- Storage local en `STORAGE_PATH` con subdirs files/thumbnails/chunks/etc. Evidencia: `backend/src/lib/storage.ts:5`, `docker-compose.prod.yml:116`.
- Real-time Socket.io con JWT handshake. Evidencia: `backend/src/lib/socket.ts:97`, `frontend/src/lib/socket.ts:79`.
- Observabilidad: logs Pino, metrics Prometheus, Sentry/GlitchTip opcional. Evidencia: `backend/src/lib/logger.ts:7`, `backend/src/lib/metrics.ts:170`, `backend/src/lib/sentry.ts:16`.
- Integraciones externas: SMTP, Google OAuth, WOPI, Cloudflare Tunnel, GlitchTip. Evidencia: `backend/src/config/index.ts:101`, `backend/src/config/index.ts:106`, `backend/src/config/index.ts:154`, `docker-compose.prod.yml:234`, `docs/deployment.md:9`.

Build y arranque
- Scripts principales: `npm run dev`, `npm run build`, `npm run setup`. Evidencia: `package.json:12`, `package.json:17`, `package.json:28`.
- Dockerfiles multi-stage para backend y frontend. Evidencia: `backend/Dockerfile:1`, `frontend/Dockerfile:1`.
- Validacion local: `npm run build` no ejecutado en esta revision; `import.meta.glob` deprecado corregido en `frontend/src/components/icons/SolidIcons.tsx:15`. `npm audit` ahora reporta 0 high/critical y 5 moderate en toolchain dev (vite/vitest).

B) Bloqueadores con severidad, evidencia, impacto y fix
- CRITICO - Secrets reales en repo. Evidencia: `.env:19`, `.env:28`, `.env:29`, `.env:38`, `.env:68`, `.env:103`, `.env:128`, `backend/.env:2`. Impacto: compromiso de DB, JWT, SMTP y admin; cualquier leak invalida seguridad. Fix: eliminar `.env` del repo, rotar credenciales, mover a gestor de secretos y reemitir JWT/ENCRYPTION_KEY.
- ALTO - Sin backups automatizados ni restores probados (confirmado por operador). Evidencia: `scripts/backup.sh:1`, `docs/backup.md:47`, `docs/runbooks/backup_restore.md:25`. Impacto: alta probabilidad de perdida de datos ante fallo. Fix: cron/systemd timer con retencion y prueba de restore programada.

C) Riesgos no bloqueantes
- Document conversion deshabilitada en Docker por falta de LibreOffice (operador requiere feature). Evidencia: `backend/src/lib/documentConversionQueue.ts:173`, `backend/Dockerfile:44`. Impacto: preview Office no disponible en prod. Fix: extender imagen e instalar LibreOffice o desactivar feature en UI.
- Busqueda usa `contains` sin indice por `name`. Evidencia: `backend/src/routes/files.ts:2769`, `backend/prisma/schema.prisma:141`. Impacto: consultas lentas con datasets grandes. Fix: indice trigram/FTS y ajustar query.
- CSP en Caddy permite `style-src 'unsafe-inline'` y `connect-src https: wss:`. Evidencia: `frontend/Caddyfile:18`. Impacto: defensa XSS mas debil y exfiltracion via XSS. Fix: eliminar unsafe-inline y limitar connect-src.
- Observabilidad no configurada por defecto (SENTRY_DSN vacio). Evidencia: `.env.production.example:114`, `docker-compose.prod.yml:123`, `backend/src/lib/sentry.ts:16`. Impacto: incidentes no detectados a tiempo. Fix: configurar SENTRY_DSN y alertas minimas.
- Vulnerabilidades moderadas en toolchain dev (vite/vitest). Evidencia: `frontend/package.json:61`, `backend/package.json:97`. Impacto: afecta desarrollo, no runtime prod. Fix: upgrade a Vite 7 y Vitest 4 cuando sea posible.
- Tests solo backend; sin coverage frontend. Evidencia: `docs/testing.md:9`. Impacto: regresiones UI no detectadas. Fix: agregar smoke tests E2E + unit tests basicos.

D) Top 10 recomendaciones con esfuerzo (S/M/L)
1) Rotar y sacar secrets del repo; mover a gestor de secretos (S).
2) Configurar backups automatizados + verificacion de restore (M).
3) Activar observabilidad: GlitchTip/Sentry + alertas health/colas/backups (M).
4) Instalar LibreOffice en imagen si se requiere preview Office (M).
5) Endurecer CSP de Caddy y alinear con Helmet (S).
6) Agregar indice de busqueda (trigram/FTS) para `files.name` (M).
7) Actualizar stack dev (vite/vitest) para eliminar CVEs moderadas (M).
8) Definir runbook multi-instancia (Redis obligatorio, locks, jobs programados) (M).
9) Agregar pruebas E2E basicas para login/upload/share (M).
10) Verificar terminacion TLS/Trust Proxy con Cloudflared (S).

E) Checklist de lanzamiento (pre, deploy, post, rollback)
- **Pre**: rotar secrets; validar `.env` fuera de repo; ejecutar `npm run build`; revisar `npm audit`; configurar backups/alertas; confirmar `RUN_MIGRATIONS_ON_START=true`.
- **Deploy**: `docker-compose -f docker-compose.prod.yml up -d --build`; verificar logs de migraciones; `npm run db:seed` para admin; verificar `/api/health/ping` y `/health`.
- **Post**: smoke tests (login, upload, download, share); validar Redis/colas; revisar logs y metricas; verificar cuota y thumbnails.
- **Rollback**: detener servicios; restaurar DB y data desde backup; re-desplegar version previa; verificar health y consistencia.

F) Preguntas abiertas si falta evidencia (respuestas del operador, sin evidencia en repo)
- Como se termina TLS/HTTPS en produccion (Cloudflare Tunnel, Caddy con TLS, Nginx)? R: Cloudflared (pendiente validar en infra).
- Estan programados backups automaticos y se han probado restores recientes? R: No y no (bloqueador en B).
- Que stack de observabilidad/alertas se usara (Sentry/GlitchTip, Prometheus, Uptime Kuma)? R: GlitchTip (pendiente configurar DSN/alertas).
- Se desea habilitar conversion de documentos Office en produccion (LibreOffice en imagen)? R: Si (requiere instalar LibreOffice).
- Se planea multi-instancia? (impacta rate limit, locks y cleanup distribuidos) R: Si (requiere runbook multi-instancia).
