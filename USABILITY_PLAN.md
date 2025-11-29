# CloudBox – Checklist de usabilidad y plan

Este documento resume, en forma de checklist y plan, todo lo que falta o está débil para que CloudBox sea realmente usable en un entorno real.

---

## 1. Checklist de cosas pendientes

### 1.1 Infraestructura, entorno y despliegue

- [ ] Definir `.env` de backend para producción con:
  - [ ] `JWT_SECRET` y `JWT_REFRESH_SECRET` fuertes.
  - [ ] `FRONTEND_URL` apuntando a la URL real del frontend.
  - [ ] `UPLOAD_DIR` apuntando a un directorio persistente.
  - [ ] Credenciales de Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) si se van a usar.
- [ ] Definir `.env` de frontend con `VITE_API_URL` apuntando al backend real (no depender de `http://localhost:4000/api` por defecto).
- [ ] Añadir documentación clara en `README.md` sobre todas las variables de entorno necesarias para producción (backend y frontend).
- [ ] Crear configuración de despliegue:
  - [ ] `Dockerfile` para backend.
  - [ ] `Dockerfile` para frontend (build estática).
  - [ ] `docker-compose.yml` que levante backend, frontend y un volumen para `uploads/`.

### 1.2 SMTP, correos y cuentas de usuario

- [ ] Configurar y probar SMTP desde el panel de admin:
  - [ ] Rellenar `host`, `port`, `secure`, `user`, `password`, `fromName`, `fromEmail` en `/admin` → Ajustes → Email (SMTP).
  - [ ] Verificar que `/admin/settings/smtp` y `/admin/settings/smtp/test` funcionan (correo de prueba).
- [ ] Verificar end‑to‑end:
  - [ ] Registro + envío de email de bienvenida/verificación.
  - [ ] Verificación de email: `/verify-email/:token`.
  - [ ] Recuperación de contraseña: `/forgot-password` → `/reset-password/:token`.
- [ ] Definir y documentar una política mínima de contraseñas (longitud y complejidad) coherente entre frontend y backend.

### 1.3 Gestión de archivos y carpetas (UX)

- [ ] Revisar endpoints existentes en `backend/src/routes/files.ts` y `backend/src/routes/folders.ts` (rename, move, favoritos, etc.) y mapearlos a la UI.
- [ ] Añadir en el frontend:
  - [ ] Acción para renombrar archivos desde `FileCard` / menú contextual / toolbar.
  - [ ] Acción para renombrar carpetas desde `FolderCard` o vista de detalles.
  - [ ] Flujo para mover archivos y carpetas a otra carpeta (selector de destino y/o drag&drop).
  - [ ] Acción para marcar/desmarcar favoritos y vista consistente de favoritos.
  - [ ] Diálogo para crear carpetas con posibilidad de elegir color y categoría (los campos `color` y `category` del modelo `Folder`).
- [ ] Revisar vacíos de UX en `Files.tsx`, `Trash.tsx`, `Favorites.tsx`:
  - [ ] Estados vacíos claros y acciones sugeridas (subir archivo, crear carpeta).
  - [ ] Botones visibles para acceder a funciones clave (nuevo, mover, renombrar, compartir).

### 1.4 Compartición y enlaces públicos

- [ ] Corregir los enlaces públicos en `frontend/src/pages/Shared.tsx`:
  - [x] Dejar de usar `window.location.origin + "/s/" + share.id`.
  - [x] Usar el `publicToken` o `publicUrl` que expone el backend (coherente con `/share/:token`).
  - [ ] Probar manualmente que el enlace copiado abre la página `PublicShare` correcta.
- [ ] Exponer un flujo de “Compartir” completo en la UI:
  - [ ] Botón/menú de “Compartir” para archivos/carpetas (en `FileCard`, `FolderCard` o `FileToolbar`).
  - [ ] Diálogo para crear un share:
    - [ ] Tipo: público / privado.
    - [ ] Permisos: lector / editor (VIEWER / EDITOR).
    - [ ] Contraseña opcional.
    - [ ] Fecha de expiración opcional.
    - [ ] Límite de descargas opcional.
  - [ ] Posibilidad de editar un share existente (cambiar password, expiración, permisos).
  - [ ] Vista clara de “compartidos por mí” vs “compartidos conmigo” (revisando `/shared` y tabs).

### 1.5 Fotos y álbumes

- [ ] Revisar `backend/src/routes/albums.ts` y el modelo `Album` / `AlbumFile`.
- [ ] En `Photos.tsx` y `Albums.tsx`:
  - [ ] Asegurar que se diferencia entre:
    - [ ] Vista de galería global (todas las fotos).
    - [ ] Vista filtrada por tipo (favoritos, vídeos, capturas).
    - [ ] Vista de álbumes.
  - [ ] Añadir UI para:
    - [ ] Crear álbumes.
    - [ ] Añadir/quitar fotos a álbumes (desde galería o detalle de fichero).
    - [ ] Elegir portada de álbum (posiblemente usando uno de los `AlbumFile`).
  - [ ] Mostrar claramente cuántas fotos tiene cada álbum.

### 1.6 Música y documentos

- [ ] Música:
  - [ ] Validar que `Music.tsx` lista correctamente archivos de audio (filtro adecuado en la API).
  - [ ] Mejorar `MusicPlayer`:
    - [ ] Permitir guardar playlists (aunque sea en localStorage).
    - [ ] Mostrar metadatos (si se deciden leer en backend) o documentar que sólo se usa el nombre de archivo.
  - [ ] Revisar UX de cola (añadir, eliminar, reordenar).
- [ ] Documentos:
  - [ ] Revisar `Documents.tsx` y el filtro `type: 'documents'` en `/files`.
  - [ ] Añadir acciones “Ver” y “Descargar” claras por documento.
  - [ ] Opcional: añadir un visor embebido (PDF/Office vía navegador) para mejorar la experiencia.

### 1.7 Panel de administración y ajustes

- [ ] AdminDashboard:
  - [ ] Validar que las estadísticas llaman a los endpoints correctos (`/api/admin/stats` o similar).
  - [ ] Añadir más métricas si son necesarias (shares, álbumes, compresión).
- [ ] AdminUsers:
  - [ ] Revisar validaciones de formulario (nombre, email, contraseña, cuota).
  - [ ] Asegurar mensajes de error localizados para errores comunes (email duplicado, formato inválido, etc.).
  - [ ] Confirmaciones claras al eliminar usuarios.
- [ ] AdminSettings:
  - [ ] Probar y pulir los tres bloques: General, Email (SMTP) y Branding.
  - [ ] Añadir validaciones mínimas (por ejemplo, cuota por defecto > 0, maxFileSize razonable).
- [ ] EmailTemplate:
  - [ ] Crear endpoints de admin para gestionar plantillas de email (si no existen).
  - [ ] Crear pantalla de UI para listar, crear, editar y marcar como “default” las plantillas.

### 1.8 UX, idioma, textos y accesibilidad

- [x] Limpieza inicial de textos en `Shared.tsx` (acentos y separadores); revisar resto de vistas.
- [ ] Corregir todos los textos con problemas de encoding (`Configuraci�n`, `Contrase�a`, `Galer�a`, etc.) a UTF‑8.
- [ ] Unificar idioma:
  - [ ] Decidir idioma principal (probablemente español).
  - [ ] Traducir todos los textos UI y mensajes de error a ese idioma.
  - [ ] Evitar mezcla de inglés/español en toasts y etiquetas.
- [ ] (Opcional) Introducir sistema de i18n si se planean varios idiomas.
- [ ] Accesibilidad:
  - [ ] Añadir `aria-label` a icon buttons (play, pause, cerrar sesión, etc.).
  - [ ] Revisar contraste de colores con los nuevos fondos (`#121212`, `#222222`).
  - [ ] Asegurar foco visible en elementos interactivos (botones, enlaces, inputs).

### 1.9 Manejo de errores y estados

- [ ] Estandarizar el uso de `toast` para errores y éxitos:
  - [ ] Mensajes consistentes y localizados.
  - [ ] Evitar mensajes genéricos tipo “Failed to load” cuando sabemos la causa.
- [ ] Añadir acciones de “Reintentar” en vistas clave:
  - [ ] Files.
  - [ ] Shared.
  - [ ] Photos / Albums.
  - [ ] Music / Documents.
- [ ] Añadir una página o banner de error global para:
  - [ ] Caída del backend.
  - [ ] Problemas de red recurrentes.

### 1.10 Calidad, tests y monitoreo

- [ ] Tests backend:
  - [ ] Tests de auth (registro, login, refresh, forgot/reset password, verify email).
  - [ ] Tests de archivos (upload, stream/download, trash, restore).
  - [ ] Tests de shares (crear, acceder por enlace público, límites de descarga).
  - [ ] Tests de admin (usuarios, settings).
- [ ] Tests frontend (mínimo smoke tests):
  - [ ] Login + redirección al dashboard.
  - [ ] Subir un archivo, verlo en `Files`.
  - [ ] Compartir un archivo y abrir el enlace público.
- [ ] Logging y monitoreo:
  - [ ] Sustituir `console.log` / `console.error` críticos por un logger estructurado (pino/winston).
  - [ ] Añadir endpoint `/health` simple para check de liveness/ready.
  - [ ] Documentar cómo se recogen y revisan logs en producción.
- [ ] Gestión de `uploads` y tareas pesadas:
  - [ ] Documentar la dependencia de `ffmpeg` (instalación por sistema).
  - [ ] Añadir manejo de errores más robusto alrededor de `ffmpeg` (logs claros, fallback).
  - [ ] Considerar límites globales de espacio y alertas cuando se acerque al límite de disco.

---

## 2. Plan propuesto por fases

Este plan ordena las tareas anteriores para llegar a un estado “usable” de forma incremental.

### Fase 1 – Bloqueantes (hacer primero)

Objetivo: que un usuario pueda registrarse, verificar su cuenta, recuperar su contraseña y usar la app en un entorno real desplegado.

- [ ] Configurar correctamente `.env` de backend y frontend (URLs, JWT, UPLOAD_DIR).
- [ ] Implementar y documentar un despliegue mínimo (Docker / guía manual).
- [ ] Configurar SMTP desde `/admin` y verificar:
  - [ ] Registro + email de verificación.
  - [ ] Recuperación de contraseña.
- [ ] Corregir el enlace de compartición público en `Shared.tsx` para que apunte a `/share/:token` con el `publicToken` correcto.

### Fase 2 – Experiencia de archivos y compartición

Objetivo: que gestionar archivos, carpetas y compartir sea cómodo e intuitivo.

- [ ] Añadir UI de renombrar y mover para archivos y carpetas.
- [ ] Añadir creación de carpetas con color/categoría.
- [ ] Completar la UI de “Compartir”:
  - [ ] Diálogo de creación/edición de enlaces.
  - [ ] Configuración de permisos, password y expiración.
- [ ] Revisar y mejorar estados vacíos y mensajes en `Files`, `Shared`, `Trash` y `Favorites`.

### Fase 3 – Secciones especiales (Fotos, Álbumes, Música, Documentos)

Objetivo: que las secciones específicas cumplan lo que prometen (galería, reproductor, documentos).

- [ ] Fotos/Álbumes:
  - [ ] Crear/editar álbumes.
  - [ ] Añadir/quitar fotos.
  - [ ] Portadas de álbum.
- [ ] Música:
  - [ ] Ajustar filtros de audio.
  - [ ] Mejorar gestión de cola y, si se desea, playlists.
- [ ] Documentos:
  - [ ] Acciones claras de ver/descargar.
  - [ ] Opcionalmente, visor embebido para PDFs.

### Fase 4 – Panel de administración y branding

Objetivo: que el administrador pueda controlar el sistema sin tocar código.

- [ ] Pulir AdminDashboard (estadísticas fiables).
- [ ] Mejorar validaciones y mensajes en AdminUsers.
- [ ] Validar y pulir AdminSettings (General, SMTP, Branding).
- [ ] Exponer gestión de plantillas de email (si se van a usar activamente).

### Fase 5 – Pulido final: UX, idioma, accesibilidad

Objetivo: que la app se perciba como un producto cuidado.

- [ ] Corregir todos los problemas de encoding en textos.
- [ ] Unificar idioma (y/o introducir i18n).
- [ ] Mejorar accesibilidad básica (ARIA, contraste, foco).
- [ ] Añadir mejor manejo de errores (reintentos y página/bander global).

### Fase 6 – Calidad, tests y monitoreo

Objetivo: poder mantener y evolucionar el sistema sin romper funcionalidades críticas.

- [ ] Implementar tests básicos de backend y frontend para flujos críticos.
- [ ] Introducir logger estructurado y endpoint `/health`.
- [ ] Documentar estrategia de logs y monitoreo.
- [ ] Revisar y endurecer la gestión de `uploads`, `ffmpeg` y tareas pesadas.

---

Este checklist y plan deberían servir como backlog inicial para ir llevando CloudBox desde el estado actual a un producto usable y desplegable en producción.

