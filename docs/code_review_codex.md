# CloudBox – Revisión de código (Codex)

Este documento resume una revisión rápida del backend y frontend realizada con ayuda de Codex, con foco en bugs funcionales, consistencia visual/UX y “nice to have” técnicos. La seguridad se menciona solo cuando afecta al comportamiento, no como auditoría principal.

---

## 1. Estado general del proyecto

- Backend y frontend compilan correctamente:
  - `npm run build:backend` → OK.
  - `npm run build:frontend` → OK (con aviso de bundles grandes).
- Pruebas backend:
  - `npm test` ejecuta Vitest.
  - Los tests de unidad (`storage.test.ts`) pasan.
  - El test de integración `upload.integration.test.ts` falla si no hay servidor en `http://localhost:3001` (ver sección 4.2).
- Linter frontend:
  - `frontend/eslint_output.json` indica que ESLint v9 está instalado pero falta `eslint.config.js` (ver sección 3.2).

---

## 2. Bugs corregidos en esta revisión

### 2.1 Backend – `compression` status API

- **Archivo:** `backend/src/routes/compression.ts`
- **Problema:**
  - El endpoint `GET /api/compression/status/:jobId` intentaba acceder a `job.data`:
    - `error: job.data && typeof job.data === 'object' && 'error' in job.data ? job.data.error : null`
  - El tipo de `compressionJob` en Prisma no incluye una columna `data`, sólo `error: string | null`, lo que:
    - Rompía la compilación de TypeScript (`Property 'data' does not exist on type ...`).
    - Haría que la API nunca devolviera correctamente el error asociado al job.
- **Cambio aplicado:**
  - El campo enviado ahora es:
    - `error: job.error`
- **Impacto:**
  - El backend vuelve a compilar.
  - El frontend puede mostrar errores reales cuando la compresión falla.

### 2.2 Desajuste de endpoint de cancelación de compresión

- **Archivos:**
  - Frontend: `frontend/src/components/modals/CompressModal.tsx`
  - Backend: `backend/src/routes/compression.ts`
- **Problema:**
  - El frontend llamaba a:
    - `DELETE /api/compression/job/:jobId`
  - El backend expone:
    - `POST /api/compression/cancel/:jobId`
  - Resultado: cancelar una compresión desde el modal no funcionaba (la llamada devolvía 404/405 pero el error se ignoraba).
- **Cambio aplicado (frontend):**
  - `handleCancel` ahora llama al endpoint real:
    - `await api.post(\`/compression/cancel/${progressState.jobId}\`);`
- **Impacto:**
  - El botón de cancelar en `CompressModal` ahora cancela los jobs en el backend.

### 2.3 Mensaje de error de red con caracteres corruptos

- **Archivo:** `frontend/src/lib/api.ts`
- **Problema:**
  - El interceptor de Axios creaba un `Error` con texto corrupto:
    - `"Error de conexi▋. Por favor verifica tu conexi▋ a internet."`
  - Este texto se mostraría tal cual en la UI, dando una mala impresión.
- **Cambio aplicado:**
  - Se reemplazó por:
    - `"Error de conexión. Por favor verifica tu conexión a internet."`
- **Impacto:**
  - Mensaje correcto y consistente en castellano para errores de red.

---

## 3. Frontend – Observaciones y mejoras

### 3.1 Consistencia visual y UX

- **Dark mode bien cubierto en general**, con clases `dark:` en la mayoría de componentes (`Header`, `MainLayout`, `Photos`, `Trash`, modales, menús contextuales).
- **Progreso de subida duplicado:**
  - Hay indicadores de progreso en:
    - `Header` (`uploadProgress` con barra + porcentaje y velocidad).
    - `components/ui/GlobalProgressIndicator.tsx`.
  - **Sugerencia:** unificar estilos y lógica en un único componente reutilizable (p.ej. `UploadProgressInline`) para evitar que se desincronicen.
- **Texto de progreso en `Header`:**
  - Muestra algo como: `"{uploadProgress}% · {formatBytes(speed)}/s"`.
  - **Sugerencia:** mover esta cadena a i18n (`header.uploadSpeed`) para que sea traducible y consistente con el resto de textos.
- **Textos hardcodeados en español:**
  - En `layouts/MainLayout.tsx` hay `aria-label` como `"Ver toda la música"`, `"Ver música favorita"`, `"Ver álbumes de música"`.
  - **Sugerencia:** extraerlos a `locales/*/common.json` usando `t('...')` para mantener coherencia en todos los idiomas.

### 3.2 Linter y calidad de código

- **ESLint no configurado para v9:**
  - `frontend/eslint_output.json` muestra:
    - “ESLint couldn't find an eslint.config.(js|mjs|cjs) file.”
  - **Sugerencia:**
    - Crear `frontend/eslint.config.js` o `.cjs` con la configuración recomendada para React + TypeScript.
    - Añadir un script en `frontend/package.json` y en el `package.json` raíz:
      - `"lint": "eslint src"` y `"lint:frontend": "cd frontend && npm run lint"`.

### 3.3 Tamaño de bundle y carga inicial

- **Observación (build):**
  - Vite avisa de un bundle JS grande:
    - `assets/index-*.js` ≈ 2.5 MB (≈ 700 KB gzip).
  - **Sugerencias de mejora:**
    - **Code splitting por rutas/features:**
      - Cargar de forma diferida (`React.lazy` + `Suspense`) módulos pesados como:
        - `MusicPlayer.tsx`
        - Páginas de `admin`
        - Vista de fotos/álbumes
    - **Separar vendor chunk:**
      - Usar `build.rollupOptions.output.manualChunks` para sacar React, Zustand, React Query, etc. en chunks separados.
    - **Revisar imports duplicados:**
      - Vite muestra que `chunkedUpload.ts` se importa dinámicamente desde `MainLayout.tsx` pero también de forma estática desde `UploadModal.tsx`.
      - **Sugerencia:** elegir una sola estrategia:
        - O bien importarlo siempre estático.
        - O bien lazy-load en ambos sitios (y extraer la lógica de subida a un hook compartido).

### 3.4 Componentes grandes / mantenibilidad

- **Componentes muy grandes:**
  - `Header.tsx`, `Sidebar.tsx`, `MainLayout.tsx`, `MusicPlayer.tsx`, varios modales y páginas (`Photos.tsx`, `Trash.tsx`) tienen muchos cientos de líneas.
  - **Sugerencias estructurales:**
    - Dividir en subcomponentes:
      - `Header` → `SearchBar`, `NewButtonDropdown`, `SelectionToolbar`, `UserMenu`, `UploadProgress`.
      - `MainLayout` → separar toda la lógica de drag & drop, marquee selection y barras de herramientas en hooks + componentes más pequeños.
    - Extraer hooks de lógica compleja:
      - Ej.: un `useExternalDropzone` o `useMarqueeSelection(workzoneRef)` en `MainLayout`.

### 3.5 Modales de compresión

- **`CompressModal.tsx`:**
  - Utiliza polling a `/compression/status/:jobId` pero el backend también expone SSE (`/compression/progress/:jobId`).
  - `progressState.currentFile` existe en el estado pero nunca se actualiza (el backend no envía `currentFile` en `status`).
  - **Sugerencias:**
    - O bien eliminar `currentFile` de `ProgressState` y de la UI para simplificar.
    - O bien extender el backend para enviar información del archivo actual y aprovecharla en el modal.
  - **Nice to have:** añadir un pequeño historial de tareas de compresión aprovechando `GET /api/compression/jobs` (p.ej. un panel en `Settings` o en `Dashboard`).

---

## 4. Backend – Observaciones y mejoras

### 4.1 Integración tests / entorno

- **Archivo:** `backend/src/__tests__/upload.integration.test.ts`
- **Situación actual:**
  - Prueba de integración contra un servidor ya levantado:
    - Usa `TEST_API_URL` o `http://localhost:3001`.
  - Si se ejecuta `npm test` sin tener el servidor arrancado, los tests fallan por `ECONNREFUSED`.
- **Sugerencias:**
  - Documentar en `README.md` o en un `docs/testing.md` cómo levantar el servidor de pruebas antes de `npm test`.
  - Alternativa más robusta:
    - Importar `app` desde `src/index.ts` (ya se exporta por defecto) y usar `supertest(app)` en lugar de hacer peticiones HTTP reales.
    - Esto elimina la dependencia de un proceso externo y mejora la velocidad de tests.

### 4.2 Rutas de compresión y descompresión

- **Compresión (`POST /api/compression/compress`):**
  - Resuelve IDs de archivos/carpetas del usuario, crea carpetas temporales, comprime en ZIP/7Z/TAR y luego mueve el resultado a la carpeta del usuario.
  - El uso de `compressionJob` + actividad (`activity` con tipo `COMPRESS`) da un buen rastro de auditoría.
- **Descompresión (`POST /api/compression/decompress`):**
  - Soporta `.zip`, `.7z`, `.tar`, `.rar`.
  - Para ZIP:
    - Usa `listZipContents` para verificar el espacio que ocupará la extracción antes de proceder.
  - Para otros formatos:
    - Usa `extract7z` vía binario `7z`.
- **Sugerencias:**
  - Documentar en `docs/api_overview.md` las rutas de compresión/descompresión:
    - `POST /compression/compress`
    - `POST /compression/decompress`
    - `GET /compression/status/:jobId`
    - `POST /compression/cancel/:jobId`
    - `GET /compression/jobs`
  - En entornos donde no esté instalado `7z`, la descompresión de `.7z/.rar/.tar` fallará:
    - Añadir una nota en `getting_started.md` indicando la dependencia de `7z` en el sistema.

### 4.3 Estructura de `index.ts`

- **Archivo:** `backend/src/index.ts` (~250+ líneas).
- **Estado actual:**
  - Mezcla:
    - Configuración de middlewares (`helmet`, `compression`, CORS, rate limits).
    - Registro de rutas.
    - Endpoints de salud (`/api/health`, `/api/health/ping`).
    - Lógica de inicialización (colas, Redis, cache, session store, Bull Board, Socket.IO).
    - Tareas de limpieza periódicas (papelera, tempStorage, refresh tokens, chunks huérfanos, jobs antiguos).
- **Sugerencias de refactor (nice to have):**
  - Extraer a módulos:
    - `createApp.ts` → sólo configuración de `express()` + rutas + middlewares, exportando un `app`.
    - `server.ts` → inicialización de colas, Socket.IO, HTTP server + shutdown.
    - `cleanupTasks.ts` → funciones `cleanupTrash`, `cleanupTempStorage`, `cleanupExpiredTokens`, `cleanupOrphanChunks`.
  - Beneficios:
    - Facilita testing (se puede importar `createApp` sin lanzar servidor).
    - Reduce el tamaño mental del fichero principal.

### 4.4 Otros detalles positivos

- Librerías de almacenamiento (`lib/storage.ts`) y compresión (`lib/compression.ts`) están bien encapsuladas y ya incluyen:
  - Validación de UUID para uploads (`getChunkPath`).
  - Protección contra Zip Slip y límites de tamaño/cantidad de archivos en extracción.
  - Limpieza de directorios temporales y chunks huérfanos.
- El sistema de colas (transcoding, thumbnails, document conversion) y el healthcheck avanzado (`/api/health`) están bien pensados para producción.

---

## 5. Nice to have – roadmap técnico

### 5.1 Calidad y DX

- Añadir scripts de conveniencia en el `package.json` raíz:
  - `"lint": "npm run lint:backend && npm run lint:frontend"`
  - `"test:all": "cd backend && npm test"`
  - `"typecheck": "npm run build:backend && npm run build:frontend"` (ya se hace con `build`, pero puede separarse).
- Añadir configuración de formateo consistente (Prettier) si no existe y enlazarla a un comando `npm run format`.

### 5.2 Observabilidad y feedback de usuario

- Aprovechar el modelo de `activity` para mostrar más feedback en UI:
  - Historial de compresiones/descompresiones.
  - Tareas largas (transcodificación, generación de miniaturas) en un panel de “Actividad de fondo”.
- Integrar un sistema de tracking de errores en frontend (`ErrorBoundary.tsx` ya tiene un TODO para enviar errores a Sentry o similar).

### 5.3 Experiencia de archivos grandes

- La combinación de:
  - Chunked upload (`lib/chunkedUpload.ts` + endpoints `/upload/init`, `/upload/chunk` (merge on last chunk)).
  - Pre-validación de subida (`validateUploadFiles` en `lib/api.ts`).
  - Colas de transcodificación/miniaturas.
- Ya está muy bien; como mejoras futuras:
  - Añadir un panel dedicado tipo “Tareas en curso” que combine:
    - Subidas.
    - Compresión/descompresión.
    - Transcodificación.

---

## 6. Resumen corto para priorizar

1. **Bugs funcionales ya resueltos:**
   - `compression.status` usaba `job.data` → ahora usa `job.error`.
   - `CompressModal` cancelaba jobs con un endpoint inexistente → ahora usa `/compression/cancel/:jobId`.
   - Mensaje de error de red corrupto en `lib/api.ts` → texto corregido.
2. **Recomendaciones de corto plazo:**
   - Configurar ESLint v9 en el frontend y añadir scripts de `lint`.
   - Documentar/ajustar los tests de integración para que no dependan de un servidor externo sin indicarlo.
3. **Nice to have a medio plazo:**
   - Refactorizar componentes y `index.ts` en piezas más pequeñas y testeables.
   - Mejorar code splitting en el frontend (lazy load de secciones pesadas).
   - Añadir pantallas UI para el historial de compresión y otras tareas en segundo plano.

Con estos pasos, el proyecto queda más robusto, predecible y cómodo de mantener, sin cambiar su diseño funcional ni su modelo de seguridad actual.
