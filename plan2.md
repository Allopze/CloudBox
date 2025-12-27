# Plan de remediacion (plan2)

Este plan lista cada problema detectado y el paso a paso para implementar la solucion.

## H-01 - XSS almacenado por contenido servido inline + tokens en localStorage (Critico)

Evidencia: backend/src/lib/security.ts:124, backend/src/lib/security.ts:161, backend/src/lib/storage.ts:109, backend/src/routes/shares.ts:476, frontend/src/stores/authStore.ts:37.

Pasos:
1) Definir politica de contenido: servir archivos potencialmente activos (html/js/svg) como descarga forzada o desde un dominio aislado.
2) Backend: en stream/view/share public usar Content-Disposition: attachment para html/js/svg; y/o bloquear esos tipos en subida.
3) Frontend: mover access token a cookie httpOnly o memoria (evitar localStorage).
4) Proxy (Caddy/NGINX): agregar CSP estricta y, si aplica, HSTS.
5) Agregar tests de seguridad: subida de .html y verificacion de que no ejecuta JS.

## H-02 - allowDownload ignorado en descarga publica (Alto)

Evidencia: backend/src/routes/shares.ts:675.

Pasos:
1) En /shares/public/:token/download validar share.allowDownload.
2) Responder 403 cuando allowDownload=false.
3) Agregar test en backend/src/__tests__/shares.test.ts.

## H-03 - Password de share en query string (Alto)

Evidencia: frontend/src/pages/public/PublicShare.tsx:44, backend/src/routes/shares.ts:480.

Pasos:
1) Cambiar endpoints a POST con password en body (no query string).
2) Emitir token temporal (cookie httpOnly o header) para descargas posteriores.
3) Actualizar frontend para usar el nuevo flujo.
4) Asegurar que logs no contengan password.

## H-04 - allow_registration y verificacion email no aplicadas (Medio)

Evidencia: backend/src/routes/admin.ts:1961, backend/src/routes/auth.ts:177, backend/src/middleware/emailVerification.ts.

Pasos:
1) Leer setting allow_registration en /auth/register.
2) Bloquear registro si allow_registration=false.
3) Aplicar middleware emailVerification en rutas sensibles (o bloquear login si email no verificado).
4) Agregar tests de registro/verification.

## H-05 - Rate limiting en memoria (Medio)

Evidencia: backend/src/index.ts:153, backend/src/lib/security.ts:328, backend/src/routes/files.ts:196.

Pasos:
1) Usar store Redis en express-rate-limit para global/auth/admin.
2) Reemplazar checkUserRateLimit por checkUserRateLimitDistributed en uploads.
3) Verificar en healthcheck que Redis esta activo para rate limiting.
4) Agregar test de rate limiting basico.

## H-06 - Tokens reset/verify en texto plano en DB (Medio)

Evidencia: backend/prisma/schema.prisma:24, backend/src/routes/auth.ts:684.

Pasos:
1) Hash del token antes de guardar (SHA-256) y comparar por hash.
2) Migrar: agregar campos *_hash o reemplazar existentes con hashes.
3) Actualizar flujo de reset/verify.
4) Agregar test unitario para reset/verify.

## H-07 - ENCRYPTION_KEY reutiliza JWT secret (Medio)

Evidencia: backend/src/lib/encryption.ts:13.

Pasos:
1) Exigir ENCRYPTION_KEY en produccion (fallar en startup si falta).
2) Documentar rotacion y separacion de claves en docs/environment_variables.md.
3) Revisar datos cifrados existentes tras cambio.

## H-08 - Transcoding en request (Medio)

Evidencia: backend/src/routes/files.ts:1892.

Pasos:
1) Encolar trabajo en transcode queue (Bull) en lugar de procesar inline.
2) Responder 202 con jobId y estado.
3) Servir archivo transcodificado al completarse.
4) Agregar metricas/alertas de cola.

## H-09 - ZIP de share publico sin limite (Medio)

Evidencia: backend/src/routes/shares.ts:754, backend/src/routes/folders.ts:536.

Pasos:
1) Calcular size total antes de armar ZIP.
2) Rechazar si supera config.limits.maxZipSize.
3) Agregar test de limite.

## H-10 - Frontend sin CSP/HSTS (Medio)

Evidencia: frontend/nginx.conf:48, Caddyfile:10, frontend/index.html.

Pasos:
1) Definir CSP estricta para frontend.
2) Agregar HSTS en proxy.
3) Validar que no rompe cargas de assets.

## H-11 - Observabilidad incompleta (Bajo)

Evidencia: backend/src/middleware/requestLogger.ts, backend/src/lib/sentry.ts.

Pasos:
1) Montar requestLogger middleware en backend/src/index.ts.
2) Inicializar Sentry/GlitchTip en backend (initSentry).
3) Definir request-id y correlacion en logs.

## H-12 - CI seguridad no bloquea (Bajo)

Evidencia: .github/workflows/ci.yml:174.

Pasos:
1) Cambiar npm audit para fallar en high.
2) Agregar SAST (semgrep) y DAST basico.
3) Publicar reportes en CI.
