# Cloudbox Production Readiness Audit

## Executive Summary
- Critical secrets and admin credentials exist in `.env`; exposure compromises auth, DB, SMTP, and data.
- GlitchTip defaults (`GLITCHTIP_SECRET_KEY`, `GLITCHTIP_DB_PASSWORD`) are present in prod config fallbacks and `.env`.
- Production data is stored under `./data` inside the repo path; actual artifacts are present in the working tree.
- Backend container runs Prisma migrations on startup, increasing rollback risk and startup fragility.
- Document conversion runs in-process when Redis is unavailable, risking CPU contention with API traffic.
- Orphan chunk cleanup uses a file lock, unsafe for multi-instance deployments.
- Public share folder download uses recursive DB traversal per request, risking heavy load for large trees.
- Suspicious activity detector blocks requests based on regex in body/URL, risking false positives.
- CSP in Caddy allows `http:`/`https:`/`ws:`/`wss:` wildcards, reducing XSS blast radius control.

## Production Readiness Verdict
Veredicto: NO

Razones clave
- Plaintext secrets and admin credentials are present in runtime config.
- Default secrets remain enabled for optional services (GlitchTip).
- Data stored inside repo path increases leak and backup risks.
- Startup migrations and non-enforced Redis dependency can impact availability.

Condiciones para produccion (si aplica)
- Remove and rotate all secrets; enforce secret management and CI secret scanning.
- Require non-default GlitchTip secrets or disable GlitchTip by default.
- Move data volumes outside the repo path and document backup/restore.
- Decouple migrations from app startup and enforce Redis for heavy jobs.

## Findings (Prioritized)
| ID | Severidad | Area | Titulo | Rutas afectadas |
| --- | --- | --- | --- | --- |
| F-01 | Critical | Seguridad | Plaintext secrets in `.env` | `.env` |
| F-02 | High | Seguridad | Default GlitchTip secrets in prod config | `.env`, `docker-compose.prod.yml` |
| F-03 | High | Datos/Operacion | Data stored under repo path `./data` | `docker-compose.prod.yml`, `data/*` |
| F-04 | Medium | Release/DB | Prisma migrations executed on app startup | `backend/Dockerfile` |
| F-05 | Medium | Rendimiento | Document conversion runs in-process without Redis | `backend/src/lib/documentConversionQueue.ts` |
| F-06 | Medium | Confiabilidad | Orphan chunk cleanup uses file lock (not multi-node safe) | `backend/src/index.ts` |
| F-07 | Medium | Rendimiento | Public share folder download uses recursive DB traversal | `backend/src/routes/shares.ts` |
| F-08 | Medium | Auth/UX | Email not normalized (case-sensitive accounts) | `backend/src/routes/auth.ts` |
| F-09 | Low | Disponibilidad | Health ping not exempt from global rate limiter | `backend/src/index.ts` |
| F-10 | Medium | Disponibilidad | Suspicious activity detector blocks on regex matches | `backend/src/lib/audit.ts` |
| F-11 | Low | Frontend Security | CSP allows `http:`/`https:`/`ws:`/`wss:` wildcards | `frontend/Caddyfile` |

### F-01: Plaintext secrets in `.env`
Severidad: Critical  
Probabilidad: High

Evidencia
- `.env`
```env
POSTGRES_PASSWORD=<REDACTED>
JWT_SECRET=<REDACTED>
JWT_REFRESH_SECRET=<REDACTED>
ENCRYPTION_KEY=<REDACTED>
SMTP_PASS=<REDACTED>
ADMIN_EMAIL=<REDACTED>
ADMIN_PASSWORD=<REDACTED>
```

Impacto
- Compromiso de base de datos, JWT, cifrado de secretos, SMTP y acceso admin.
- Exposicion de datos y suplantacion de usuarios.

Recomendacion
- Retirar `.env` del repo (si esta trackeado) y rotar todos los secretos.
- Usar un secreto manager (Vault/KMS/SSM) y variables de entorno inyectadas en despliegue.
- Agregar escaneo de secretos en CI (gitleaks/secretlint) y pre-commit.

Patch sugerido (ejemplo)
```diff
- CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
+ CMD ["node", "dist/index.js"]
```
```text
git rm --cached .env
```

Como probar el fix
- Reconfigurar secretos en el entorno y validar login/refresh token y envio de email.

### F-02: Default GlitchTip secrets in prod config
Severidad: High  
Probabilidad: Medium

Evidencia
- `.env`
```env
GLITCHTIP_DB_PASSWORD=glitchtip_secret_password
GLITCHTIP_SECRET_KEY=change-me-in-production
```
- `docker-compose.prod.yml`
```yaml
glitchtip:
  environment:
    SECRET_KEY: ${GLITCHTIP_SECRET_KEY:-change-me-in-production}
glitchtip-postgres:
  environment:
    POSTGRES_PASSWORD: ${GLITCHTIP_DB_PASSWORD:-glitchtip_secret}
```

Impacto
- Compromiso de GlitchTip (sesiones, eventos, datos de error).

Recomendacion
- Eliminar defaults y exigir valores reales:
```diff
- SECRET_KEY: ${GLITCHTIP_SECRET_KEY:-change-me-in-production}
+ SECRET_KEY: ${GLITCHTIP_SECRET_KEY:?GLITCHTIP_SECRET_KEY is required}
```
- Generar secretos fuertes y documentar rotacion.

Como probar el fix
- Levantar `docker-compose.prod.yml` sin variables y confirmar que falla con error claro.
- Levantar con secretos validos y verificar UI/DSN.

### F-03: Data stored under repo path `./data`
Severidad: High  
Probabilidad: Medium

Evidencia
- `docker-compose.prod.yml`
```yaml
postgres:
  volumes:
    - ./data/postgres:/var/lib/postgresql/data
backend:
  volumes:
    - ./data/cloudbox:/app/data
```
- Working tree data presence (example)
```
data/files/<user-id>/<file-id>.pptx
data/files/<user-id>/<file-id>_preview.pdf
```

Impacto
- Riesgo de leak accidental (commits, backups del repo, copias locales).
- Contaminacion del repo con datos de usuario.

Recomendacion
- Mover `./data` a ruta fuera del repo (ej: `/var/lib/cloudbox`).
- Asegurar backups y permisos fuera del workspace.
- Validar que no se empaquete en release artifacts.

Como probar el fix
- Cambiar volumen y reiniciar; verificar que la app lee/escribe en la nueva ruta.

### F-04: Prisma migrations executed on app startup
Severidad: Medium  
Probabilidad: Medium

Evidencia
- `backend/Dockerfile`
```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

Impacto
- Arranques lentos o fallidos; riesgo de downtime en despliegues.
- Migraciones no coordinadas con rollback.

Recomendacion
- Separar migraciones del arranque de la app (job/step dedicado).
- Agregar bandera `RUN_MIGRATIONS_ON_START=true` si se desea opt-in.

Como probar el fix
- Deploy con migrations ejecutadas por pipeline y validar que el contenedor inicia sin migrar.

### F-05: Document conversion runs in-process without Redis
Severidad: Medium  
Probabilidad: Medium

Evidencia
- `backend/src/lib/documentConversionQueue.ts`
```ts
isRedisAvailable = await checkRedisConnection();
if (!isRedisAvailable) {
  logger.info('Document conversion queue running in fallback mode (no Redis)', {
    concurrencyLimit: FALLBACK_CONCURRENCY,
  });
  return;
}
```

Impacto
- CPU/IO de conversion compite con API.
- Latencia y timeouts bajo carga.

Recomendacion
- En produccion, exigir Redis (similar a transcoding).
- Responder 503 cuando Redis no esta disponible.

Como probar el fix
- Con `NODE_ENV=production` y Redis abajo, pedir `/api/files/:id/pdf-preview` y verificar respuesta 503.

### F-06: Orphan chunk cleanup uses file lock (not multi-node safe)
Severidad: Medium  
Probabilidad: Low-Medium

Evidencia
- `backend/src/index.ts`
```ts
// Note: In multi-instance deployments, use distributed locking (e.g., Redis)
const lockPath = path.join(config.storage.path, '.chunk_cleanup_lock');
```

Impacto
- En multi-instancia puede borrar chunks activos o romper uploads.

Recomendacion
- Implementar lock distribuido (Redis/Redlock) o ejecutar cleanup en un solo nodo.

Como probar el fix
- Levantar dos instancias y verificar que solo una ejecute limpieza.

### F-07: Public share folder download uses recursive DB traversal
Severidad: Medium  
Probabilidad: Medium

Evidencia
- `backend/src/routes/shares.ts`
```ts
const calculateFolderSize = async (folderId: string): Promise<bigint> => {
  const files = await prisma.file.findMany({ where: { folderId, isTrash: false } });
  let total = files.reduce((sum, f) => sum + f.size, BigInt(0));
  const subfolders = await prisma.folder.findMany({ where: { parentId: folderId, isTrash: false } });
  for (const sub of subfolders) {
    total += await calculateFolderSize(sub.id);
  }
  return total;
};
```

Impacto
- N+1 queries por cada descarga; alto consumo DB en arboles grandes.

Recomendacion
- Usar `folder.size` precalculado o CTE recursivo con agregacion.
- Cachear tamanos de carpeta para descargas publicas.

Como probar el fix
- Descargar share con miles de archivos y comparar tiempo y numero de queries.

### F-08: Email not normalized (case-sensitive accounts)
Severidad: Medium  
Probabilidad: Medium

Evidencia
- `backend/src/routes/auth.ts`
```ts
const { email, password, name } = req.body;
const existingUser = await prisma.user.findUnique({ where: { email } });
...
const user = await prisma.user.findUnique({ where: { email } });
```

Impacto
- Duplicados por diferencia de mayusculas/minusculas.
- Login falla si el usuario no usa el mismo case.

Recomendacion
- Normalizar a lowercase en register/login y en DB (CITEXT o indice en lower(email)).

Como probar el fix
- Registrar `User@Example.com` y loguear con `user@example.com`.

### F-09: Health ping not exempt from global rate limiter
Severidad: Low  
Probabilidad: Low

Evidencia
- `backend/src/index.ts`
```ts
skip: (req) => {
  return req.originalUrl === '/api/health' || req.path === '/health';
},
```

Impacto
- Health checks pueden recibir 429 bajo alto trafico.

Recomendacion
- Excluir `/api/health/ping` y endpoints de status.

Como probar el fix
- Ejecutar muchas requests a `/api/health/ping` y verificar que no limite.

### F-10: Suspicious activity detector blocks on regex matches
Severidad: Medium  
Probabilidad: Low

Evidencia
- `backend/src/lib/audit.ts`
```ts
const sqlPatterns = [
  /union\s+(all\s+)?select/i,
  /exec\s+(xp_|sp_)/i,
];
...
if (warnings.some(w => w.includes('SQL injection') || w.includes('XSS'))) {
  res.status(403).json({ error: 'Request blocked for security reasons' });
  return;
}
```

Impacto
- Falsos positivos bloquean requests legitimas (ej: contenido con "union select").

Recomendacion
- Cambiar a log-only o limitar a query params.
- Integrar con WAF externo para bloqueo real.

Como probar el fix
- Enviar texto con patrones SQL/XSS y verificar que no bloquee cuando se espera.

### F-11: CSP allows broad `http:`/`https:`/`ws:`/`wss:` sources
Severidad: Low  
Probabilidad: Low

Evidencia
- `frontend/Caddyfile`
```caddy
Content-Security-Policy "... img-src 'self' data: blob: http: https:; ... connect-src 'self' ... http: https: ws: wss:; ..."
```

Impacto
- CSP no limita destinos de exfiltracion si existe XSS.

Recomendacion
- Restringir a dominios requeridos (frontend/API/analytics).
- Evitar `http:`/`https:` wildcard y reducir `unsafe-inline` gradualmente.

Como probar el fix
- Verificar consola CSP y funcionalidades clave (login, uploads, previews).

## Nice-to-have Improvements
- Add secret scanning in CI (gitleaks/secretlint) with fail-on-detection (valor: alto, esfuerzo: S)
- Add a dedicated migration job/container and rollback runbook (valor: alto, esfuerzo: M)
- Add .dockerignore to prevent build context bloat (valor: medio, esfuerzo: S)
- Add caching for public share folder size and zip generation (valor: medio, esfuerzo: M)
- Convert audit logging to pino with redaction (valor: medio, esfuerzo: S)
- Add rate limit metrics/exporter endpoints (valor: medio, esfuerzo: M)
- Add SLO dashboards and alerting for queue latency (valor: medio, esfuerzo: M)
- Add end-to-end tests for auth refresh and 2FA (valor: medio, esfuerzo: M)

## Test & CI Recommendations
- Add integration tests for chunked upload idempotency and cleanup.
- Add regression tests for share download limits and folder downloads.
- Add CI job to validate CSP headers and security headers on `/`.
- Add security scan for tracked `.env` or secrets in repo history.

## Security Hardening Checklist
- Rotate all secrets (DB, JWT, encryption, SMTP, admin).
- Enforce HTTPS and HSTS end-to-end.
- Require Redis for rate limiting and background workers in production.
- Tighten CSP and remove wildcard sources.
- Verify CORS allowlist for production domains only.
- Ensure admin password is not stored in plaintext anywhere.

## Observability Checklist
- Structured logs (pino) for all security and audit events.
- Correlation ID propagated to logs, metrics, and error tracking.
- Queue metrics: latency, failure rate, retries.
- Health/readiness endpoints monitored with alerts.
- Log retention and PII redaction policy documented.

## Deployment Checklist
- Migrations run as a separate step with rollback plan.
- Backups configured for DB and storage volumes.
- Data volumes stored outside repo path and permissions hardened.
- Resource limits set for backend/worker containers.
- Redis and Postgres network access restricted to internal network.

## Assumptions & Unknowns
- Deployment is Docker Compose on a single host with local storage.
- No Kubernetes/IaC present in repo.
- Cloudflare Tunnel is used for public access as described in docs.
- No external object storage (S3/GCS) configured.

## Appendix
Comandos utiles (segun AGENTS.md):
- `npm run dev`
- `npm run setup`
- `cd backend && npm test`
- `npm run db:studio`

### Must-fix before production (Top 10)
1. Remove `.env` secrets from repo; rotate all credentials.
2. Replace GlitchTip default secrets and enforce required values.
3. Move data volumes out of repo path and verify backups.
4. Separate Prisma migrations from app startup.
5. Require Redis for document conversion in production.
6. Implement distributed lock for orphan chunk cleanup.
7. Optimize public share folder downloads (size calc + zip).
8. Normalize emails and enforce case-insensitive uniqueness.
9. Remove request blocking based on regex or scope it narrowly.
10. Tighten CSP to remove `http:`/`https:`/`ws:`/`wss:` wildcards.

### Quick wins (Top 10)
1. Exempt `/api/health/ping` from global rate limiter.
2. Add CI secret scanning (gitleaks/secretlint).
3. Add .dockerignore for backend/frontend contexts.
4. Convert audit logs to pino with redaction.
5. Document Redis requirement for all background jobs.
6. Add alerting for queue failures and high latency.
7. Add runbook for migrations and rollback.
8. Add test for email normalization.
9. Add test for share folder download limit.
10. Validate CSP in CI with a simple curl check.

Production readiness: NOT READY
