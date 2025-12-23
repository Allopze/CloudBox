# Nuevas funcionalidades para CloudBox

## Resumen ejecutivo (qué es CloudBox hoy)
CloudBox es un monorepo con backend Express + Prisma y frontend React/Vite. Soporta gestión de archivos y carpetas con uploads directos y chunked, compartición pública, álbumes de fotos, vista de documentos, miniaturas/transcoding en background y cola de trabajos. Hay autenticación con JWT, roles ADMIN/USER, auditoría básica y soporte opcional de Redis/SMTP/Google OAuth. Evidencia principal en `backend/src/index.ts`, `backend/prisma/schema.prisma`, `backend/src/routes/*.ts`, `frontend/src/App.tsx` y `frontend/src/pages/*`.

## Mapa del sistema (módulos + rutas principales)
- Backend (Express/TS): `backend/src/index.ts` monta rutas `/auth`, `/users`, `/files`, `/folders`, `/shares`, `/trash`, `/albums`, `/compression`, `/activity`, `/admin`, `/document-preview`.
- Auth/sesiones: `backend/src/routes/auth.ts` (login/refresh/logout, sesiones), `backend/src/middleware/auth.ts`.
- Archivos: `backend/src/routes/files.ts` (uploads, descargas, thumbnails, preview, streaming).
- Carpetas: `backend/src/routes/folders.ts` (CRUD, búsqueda por nombre).
- Compartidos: `backend/src/routes/shares.ts` (public shares por token, colaboradores en DB).
- Actividad: `backend/src/routes/activity.ts`, `backend/src/lib/audit.ts`.
- Jobs: `backend/src/lib/thumbnailQueue.ts`, `backend/src/lib/transcodingQueue.ts`, `backend/src/lib/documentConversionQueue.ts`.
- Frontend: rutas principales en `frontend/src/App.tsx` y páginas en `frontend/src/pages/*` (Files, Photos, Albums, Music, Documents, Shared, Trash, Settings, Dashboard, AdminDashboard).

## Diagnóstico de gaps y fricciones
- Compartición “privada” con colaboradores no funciona de punta a punta: existen `Share` y `ShareCollaborator` en `backend/prisma/schema.prisma`, pero los endpoints públicos solo aceptan token y `frontend/src/pages/Shared.tsx` muestra enlaces públicos; no hay acceso autenticado por colaboración en `backend/src/routes/shares.ts`.
- `allowDownload` existe en `Share` pero no se aplica en `backend/src/routes/shares.ts`.
- Previews de Office: hay conversión a PDF en `backend/src/routes/documentPreview.ts`, pero la UI actual pide descargar en `frontend/src/components/gallery/DocumentViewer.tsx`.
- Sesiones: existen endpoints en `backend/src/routes/auth.ts` pero no UI en `frontend/src/pages/Settings.tsx`.
- Búsqueda es solo por nombre (contains) en `backend/src/routes/files.ts` y `backend/src/routes/folders.ts`.
- No hay versionado ni etiquetas en `backend/prisma/schema.prisma`.
- Socket.io está preparado en `backend/src/lib/socket.ts` y `frontend/src/lib/socket.ts`, pero no hay eventos usados en UI.

## Propuestas (tabla priorizada)

| Nombre | Problema que resuelve | Valor | Esfuerzo | Riesgo | Dependencias técnicas | Primer release (MVP) |
|---|---|---|---|---|---|---|
| Acceso real a compartición privada | Colaboradores no pueden acceder a recursos compartidos | Alto | M | Medio | `backend/src/routes/shares.ts`, `frontend/src/pages/Shared.tsx`, `backend/prisma/schema.prisma` | Endpoint para listar/abrir shares privados con auth + UI en Shared |
| `allowDownload` en shares públicos | Falta control de descarga en enlaces públicos | Medio | S | Bajo | `backend/src/routes/shares.ts`, `backend/prisma/schema.prisma` | Bloquear descarga cuando `allowDownload=false` |
| Preview Office por PDF | UX pobre para doc/xls/ppt | Alto | M | Medio | `backend/src/routes/documentPreview.ts`, `frontend/src/components/gallery/DocumentViewer.tsx` | Llamar `/files/:id/pdf-preview` y renderizar PDF |
| UI de sesiones/dispositivos | Usuarios no pueden gestionar sesiones | Medio | S | Bajo | `backend/src/routes/auth.ts`, `frontend/src/pages/Settings.tsx` | Lista de sesiones + revoke |
| 2FA TOTP | Seguridad reforzada | Alto | M | Medio | Nuevo modelo, `backend/src/routes/auth.ts` | Habilitar TOTP opcional y verificación en login |
| Búsqueda full-text | Búsqueda limitada por nombre | Alto | L | Alto | Postgres FTS en Prisma + endpoints | Indexado básico por nombre/metadata |
| Etiquetas (tags) | Organización flexible | Medio | M | Medio | Nuevos modelos + UI | CRUD tags + filtro |
| Versionado de archivos | Recuperar versiones previas | Alto | L | Medio | Nuevos modelos, storage | Guardar versiones al sobrescribir |
| Reemplazar archivo (misma URL) | Flujos de actualización | Medio | M | Medio | `backend/src/routes/files.ts` | Endpoint replace + historial |
| Acciones masivas completas | UX lenta en listas | Medio | S | Bajo | `frontend/src/components/*` | Barra con mover/compartir/favorito |
| Progreso realtime (Socket) | Feedback en jobs | Medio | M | Bajo | `backend/src/lib/socket.ts`, `frontend/src/lib/socket.ts` | Emitir progreso de conversiones |
| Pipeline de transcodificación | Video/audio heavy en request | Medio | L | Medio | `backend/src/lib/transcodingQueue.ts` | Mover a jobs + cache |
| Auditoría admin visible | Admin sin visibilidad | Medio | S | Bajo | `backend/src/routes/activity.ts` | Página admin de logs |
| Storage insights | Control de uso y cuotas | Medio | M | Medio | Prisma + admin | Dashboard por usuario |
| Webhooks opcionales | Integración externa | Medio | M | Medio | Nuevo módulo | Eventos de archivo |
| PWA offline básica | Mobile-friendly | Medio | M | Medio | `frontend` | Cache de listas recientes |
| OpenAPI/Docs | DevEx | Medio | M | Bajo | Express middleware | Generar docs de API |

## Detalle técnico Top 3

### 1) Acceso real a compartición privada
- Diseño: Añadir endpoints autenticados en `backend/src/routes/shares.ts` para listar shares donde `ShareCollaborator.userId = req.user.userId` y permitir acceso a archivos/carpetas. Mantener token público solo para `PUBLIC`.
- Backend: Validar permisos (VIEWER/EDITOR) usando `ShareCollaborator.permission` en `backend/prisma/schema.prisma`. Reusar `Activity` en `backend/src/lib/audit.ts` para logs.
- Frontend: Nueva vista en `frontend/src/pages/Shared.tsx` con tabs “Public” y “Private”; consumir endpoint autenticado.
- Modelo de datos: Reusar `Share` y `ShareCollaborator` existentes en `backend/prisma/schema.prisma`.
- Edge cases: share expirado, recurso en trash, permisos editor, usuario eliminado.
- Métricas: % shares privados accesibles, tiempo de acceso, errores 403.
- Pasos:
  1) Endpoint `/shares/private` (list) y `/shares/:id` (auth) en `backend/src/routes/shares.ts`.
  2) Permisos y guardas en backend.
  3) UI Shared con switch y estados vacíos.
  4) Tests básicos en `backend`.

### 2) Preview Office vía PDF
- Diseño: Usar `/files/:id/pdf-preview` de `backend/src/routes/documentPreview.ts` en `frontend/src/components/gallery/DocumentViewer.tsx`.
- Backend: Asegurar el job de conversión en `backend/src/lib/documentConversionQueue.ts` y manejo de cache.
- Frontend: Mostrar loader, fallback a descarga si no hay preview.
- Modelo: Sin cambios.
- Edge cases: archivo corrupto, timeout de conversión, límites de tamaño.
- Métricas: % de previews exitosas, tiempo medio de preview.
- Pasos:
  1) Endpoint consumido en DocumentViewer.
  2) UI de progreso y mensajes de error.
  3) Telemetría básica (Activity).

### 3) UI de sesiones/dispositivos
- Diseño: Usar endpoints de `backend/src/routes/auth.ts` para listar y revocar sesiones.
- Backend: Reutilizar `sessionStore` en `backend/src/lib/sessionStore.ts`.
- Frontend: Sección en `frontend/src/pages/Settings.tsx` con lista + botón “Cerrar sesión” por dispositivo.
- Modelo: Sin cambios.
- Edge cases: Redis no disponible, sesión actual revocada.
- Métricas: % de sesiones revocadas, errores de revoke.
- Pasos:
  1) UI en Settings.
  2) Integración con API.
  3) Mensajes de éxito/error.

## Top 5 siguientes (tras implementar el Top 3)

| Prioridad | Nombre | Valor | Esfuerzo | Riesgo | Evidencia/Dependencias | MVP |
|---|---|---|---|---|---|---|
| 1 | 2FA TOTP opcional | Alto | M | Medio | No hay 2FA en `backend/src/routes/auth.ts` ni campos en `backend/prisma/schema.prisma` | Alta de TOTP + verificacion en login + codigos de respaldo |
| 2 | Auditoria admin visible | Medio-Alto | S/M | Bajo | Actividad en `backend/prisma/schema.prisma` y endpoint en `backend/src/routes/activity.ts`; UI solo en `frontend/src/pages/Dashboard.tsx` | Vista admin con filtros basicos y export |
| 3 | Acciones masivas completas | Medio | M | Bajo | Toolbar solo delete en `frontend/src/components/files/FileToolbar.tsx`; faltan endpoints bulk en `backend/src/routes/files.ts`/`backend/src/routes/folders.ts` | Mover/compartir/favorito en seleccion multiple |
| 4 | Etiquetas de usuario para archivos | Medio | M | Medio | Solo se muestran `metadata.tags` en `frontend/src/components/gallery/MediaViewer/DetailsPanel.tsx`; no hay modelo en `backend/prisma/schema.prisma` | CRUD tags y filtro por tag |
| 5 | Busqueda full-text y filtros | Alto | L | Alto | Busqueda por nombre en `backend/src/routes/files.ts` y `backend/src/routes/folders.ts` | FTS por nombre/metadata + filtros por tipo |

## No recomiendo hacer ahora
- Cliente de sync completo tipo Dropbox: alto esfuerzo, requiere agentes locales y conflictos complejos.
- Migrar a storage S3 obligatorio: rompe autohospedaje simple y requiere infra externa.
- Indexación de contenido/OCR a escala: alto costo y complejidad; mejor empezar con metadata.

## Nota de ejecución
No se ejecutó `npm run dev` en este entorno no interactivo. Para validar UX, correr en local y revisar flujos de subida y compartición.
