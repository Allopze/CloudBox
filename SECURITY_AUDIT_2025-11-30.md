# 🔒 Auditoría de Seguridad - CloudBox
**Fecha:** 30 de Noviembre, 2025  
**Versión:** 1.0.0  
**Auditor:** GitHub Copilot (Claude Opus 4.5)

---

## 📋 Resumen Ejecutivo

Se ha realizado una auditoría completa del código backend de CloudBox. En general, la aplicación implementa buenas prácticas de seguridad, pero se han identificado algunas áreas de mejora y vulnerabilidades potenciales que requieren atención.

### Calificación General: **B+** (Bueno, con mejoras necesarias)

---

## ✅ Aspectos Positivos

### 1. Autenticación y Sesiones
- ✅ **Tokens JWT correctamente implementados** con secretos separados para access y refresh tokens
- ✅ **Validación de secretos en producción** - La aplicación rechaza iniciar si los secretos son por defecto
- ✅ **Refresh tokens almacenados en base de datos** con expiración
- ✅ **Protección contra fuerza bruta** implementada con bloqueo de cuenta (5 intentos / 15 minutos)
- ✅ **Limpieza automática de tokens expirados** cada hora

### 2. Seguridad de Archivos
- ✅ **Sanitización de nombres de archivo** para prevenir path traversal
- ✅ **Validación de tipos MIME** con mapeo extensión-MIME
- ✅ **Bloqueo de extensiones peligrosas** (.php, .exe, .bat, etc.)
- ✅ **Directorio de datos NO servido estáticamente** (comentado correctamente)
- ✅ **UUID para nombres de archivo** evitando exposición de nombres originales

### 3. Rate Limiting
- ✅ **Rate limiting global** (1000 requests / 15 min)
- ✅ **Rate limiting estricto en auth** (20 requests / 15 min)
- ✅ **Rate limiting para admin** (100 requests / 15 min)
- ✅ **Rate limiting por usuario** en uploads

### 4. Protección contra Ataques Comunes
- ✅ **Helmet.js** configurado con CSP
- ✅ **Detección de actividad sospechosa** (SQL injection, XSS, herramientas de escaneo)
- ✅ **Logging de auditoría** para eventos de seguridad
- ✅ **Transacciones atómicas** para operaciones críticas (reset de contraseña)

### 5. Almacenamiento
- ✅ **Cuotas de almacenamiento** por usuario
- ✅ **Reserva temporal de espacio** durante uploads chunked para evitar race conditions
- ✅ **Validación de tamaño máximo de archivo** por usuario

---

## ⚠️ Vulnerabilidades y Riesgos Identificados

### 🔴 CRÍTICO

#### 1. Exposición de Información en Errores
**Ubicación:** `backend/src/routes/auth.ts:161-169`
```typescript
res.status(401).json({ 
  error: 'Esta cuenta fue creada con Google. Por favor, inicia sesión con Google.',
  code: 'OAUTH_ACCOUNT',
  remainingAttempts: lockoutStatus.remainingAttempts - 1,
});
```
**Riesgo:** Permite enumeración de usuarios OAuth vs normales.  
**Recomendación:** Usar mensaje genérico "Email o contraseña incorrectos" para todos los casos de fallo.

---

#### 2. Falta de Verificación de Email Obligatoria
**Ubicación:** `backend/src/routes/auth.ts:90-130`  
**Riesgo:** Los usuarios pueden usar la aplicación sin verificar su email, lo que permite:
- Registro con emails falsos
- Suplantación de identidad
- Spam mediante funciones de compartir

**Recomendación:** Agregar middleware que verifique `emailVerified: true` para operaciones sensibles.

---

### 🟠 ALTO

#### 3. Almacenamiento de Contraseña de SMTP en Texto Plano
**Ubicación:** `backend/src/routes/admin.ts:380`
```typescript
{ key: 'smtp_pass', value: pass },
```
**Riesgo:** La contraseña SMTP se almacena sin cifrar en la base de datos.  
**Recomendación:** Cifrar con una clave maestra del servidor o usar variables de entorno exclusivamente.

---

#### 4. Falta de Validación de Permisos en Stream de Archivos
**Ubicación:** `backend/src/routes/files.ts:757-760`
```typescript
const file = await findFile(id, userId);
```
**Riesgo:** La función `findFile` permite acceso a archivos con shares públicos sin validar contraseña en algunos casos.  
**Recomendación:** Revisar y reforzar la validación de permisos en la función `findFile`.

---

#### 5. Vulnerabilidad IDOR en Download de Archivos Compartidos
**Ubicación:** `backend/src/routes/shares.ts:312-360`  
**Riesgo:** Un atacante podría intentar acceder a archivos de carpetas compartidas usando IDs de archivos de otras carpetas.  
**Mitigación Existente:** Hay verificación recursiva de parentesco, pero el límite de profundidad (20) podría ser insuficiente para estructuras muy profundas.

---

### 🟡 MEDIO

#### 6. Tokens de Reset/Verificación con Entropía Limitada
**Ubicación:** `backend/src/lib/jwt.ts:22-24`
```typescript
export const generateRandomToken = (): string => {
  return randomBytes(32).toString('hex');
};
```
**Evaluación:** 32 bytes es aceptable (256 bits), pero:
- No hay expiración configurable granular
- No hay límite de intentos para tokens de verificación

**Recomendación:** Implementar rate limiting para endpoints de verificación/reset.

---

#### 7. Logs de Auditoría No Persistentes para Todos los Eventos
**Ubicación:** `backend/src/lib/audit.ts:55-58`
```typescript
function shouldPersist(action: AuditAction): boolean {
  const persistActions: AuditAction[] = [
    'LOGIN_FAILED',
    // ... solo algunos eventos
  ];
```
**Riesgo:** Eventos importantes como `FILE_DOWNLOAD` y `LOGIN_SUCCESS` solo se logean en consola.  
**Recomendación:** Considerar persistir todos los eventos de auditoría para compliance y forense.

---

#### 8. Falta de Protección CSRF
**Ubicación:** General  
**Riesgo:** Las cookies de sesión no tienen protección CSRF implementada.  
**Nota:** La aplicación usa tokens Bearer, lo que mitiga parcialmente el riesgo.  
**Recomendación:** Si se usan cookies para auth, implementar tokens CSRF.

---

#### 9. Thumbnails Generados Sin Límite de Concurrencia Efectivo
**Ubicación:** `backend/src/lib/thumbnailQueue.ts`
```typescript
private concurrency = 2;
private maxQueueSize = 1000;
```
**Riesgo:** Un atacante podría saturar la cola con 1000 archivos maliciosos.  
**Recomendación:** Implementar rate limiting por usuario en la generación de thumbnails.

---

### 🟢 BAJO

#### 10. Información de Versión Expuesta
**Ubicación:** `backend/src/index.ts:133`
```typescript
version: process.env.npm_package_version || '1.0.0',
```
**Riesgo:** El endpoint `/api/health` expone la versión de la aplicación.  
**Recomendación:** Ocultar en producción o requerir autenticación.

---

#### 11. Compresión Habilitada para Todos los Contenidos de Texto
**Ubicación:** `backend/src/index.ts:47-58`  
**Riesgo:** Potencial vulnerabilidad BREACH si se transmiten datos sensibles en respuestas comprimidas.  
**Mitigación:** Las respuestas JSON de auth no contienen secretos reflejados.

---

#### 12. Límites de Profundidad Arbitrarios
**Ubicación:** Múltiples archivos
- `folders.ts:75` - MAX_BREADCRUMB_DEPTH = 50
- `folders.ts:143` - MAX_DELETE_DEPTH = 100

**Riesgo:** Inconsistencia en límites podría causar comportamientos inesperados.  
**Recomendación:** Centralizar configuración de límites.

---

## 📊 Análisis de Dependencias

### Dependencias Críticas a Monitorear
| Paquete | Uso | Riesgo |
|---------|-----|--------|
| `bcryptjs` | Hash de contraseñas | ⚠️ Considerar migrar a `argon2` |
| `jsonwebtoken` | Tokens JWT | ✅ Mantener actualizado |
| `sharp` | Procesamiento de imágenes | ⚠️ Superficie de ataque amplia |
| `archiver` | Creación de ZIPs | ⚠️ Posible DoS con archivos grandes |
| `exceljs` | Parsing Excel | ⚠️ Posibles vulnerabilidades XXE/XSS |

---

## 🛡️ Recomendaciones Prioritarias

### Inmediato (Sprint Actual)
1. [ ] Unificar mensajes de error de autenticación para evitar enumeración
2. [ ] Cifrar credenciales SMTP en base de datos
3. [ ] Agregar rate limiting a endpoints de verificación de email/reset

### Corto Plazo (1-2 Sprints)
4. [ ] Implementar verificación de email obligatoria para operaciones sensibles
5. [ ] Persistir todos los eventos de auditoría
6. [ ] Revisar y unificar límites de profundidad

### Medio Plazo (Roadmap)
7. [ ] Migrar de `bcryptjs` a `argon2` para mejor resistencia a GPUs
8. [ ] Implementar 2FA/MFA opcional
9. [ ] Agregar Content-Security-Policy más restrictivo
10. [ ] Implementar rotación automática de secretos JWT

---

## 📝 Configuración de Seguridad Recomendada

### Variables de Entorno Mínimas para Producción
```env
# Secretos (mínimo 32 caracteres aleatorios)
JWT_SECRET=<random_64_chars>
JWT_REFRESH_SECRET=<random_64_chars>

# Tokens de corta duración
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Producción
NODE_ENV=production

# HTTPS obligatorio
FRONTEND_URL=https://your-domain.com
```

---

## 🔄 Próximos Pasos

1. Revisión de frontend para vulnerabilidades XSS
2. Pruebas de penetración automatizadas
3. Análisis de dependencias con `npm audit`
4. Revisión de configuración de base de datos (SQLite → PostgreSQL para producción)

---

## 📎 Archivos Revisados

- `backend/src/index.ts` - Configuración del servidor
- `backend/src/lib/audit.ts` - Sistema de auditoría
- `backend/src/lib/security.ts` - Funciones de seguridad
- `backend/src/lib/jwt.ts` - Manejo de tokens
- `backend/src/lib/storage.ts` - Gestión de almacenamiento
- `backend/src/lib/thumbnailQueue.ts` - Cola de thumbnails
- `backend/src/middleware/auth.ts` - Middleware de autenticación
- `backend/src/routes/auth.ts` - Rutas de autenticación
- `backend/src/routes/files.ts` - Rutas de archivos
- `backend/src/routes/shares.ts` - Rutas de compartir
- `backend/src/routes/admin.ts` - Rutas administrativas
- `backend/src/routes/users.ts` - Rutas de usuarios
- `backend/src/routes/folders.ts` - Rutas de carpetas
- `backend/src/config/index.ts` - Configuración
- `backend/prisma/schema.prisma` - Esquema de base de datos

---

*Este documento es confidencial y debe ser tratado con la debida seguridad.*
