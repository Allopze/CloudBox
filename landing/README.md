# CloudBox Landing (`/landing`)

Landing page de marketing para CloudBox, separada del frontend principal de la app (`/frontend`).

Esta SPA (React + Vite + Tailwind) consume configuración dinámica (textos, secciones, links e imágenes) desde el backend de CloudBox, y permite editar todo desde el panel de administrador dentro de la app.

---

## Qué incluye

- **Landing pública responsive** con secciones: Hero + mockup, Beneficios, Cómo funciona (nube vs autohospedado), Features, Comparativa, Seguridad, GitHub/OSS, Casos de uso, FAQ y Footer.
- **Contenido editable y persistente** (se guarda en la DB como setting).
- **Imágenes administrables** (hero/feature) y **branding** (logos, favicon) gestionados por el backend.
- **Tema claro/oscuro** con toggle (se guarda en `localStorage`).

---

## Arquitectura (alto nivel)

### Fuente de verdad del contenido

- **Landing config** (JSON): lo entrega el backend en `GET /api/admin/settings/landing`.
  - Persistencia: `Settings.key = landing_config_v1` (se guarda como JSON serializado).
  - Si falta o es inválido, el backend responde una configuración por defecto.
- **Branding** (logo, favicon, nombre del sitio): `GET /api/admin/settings/branding`.
- **Assets landing** (hero/feature): `GET /api/admin/landing/assets/:type` (`hero` | `feature`).

### Edición (admins)

La edición se hace desde CloudBox app (no desde esta SPA):

- Ruta: `/admin/landing`
- Requiere: usuario con rol `ADMIN`

Desde ahí puedes editar:
- Textos, CTAs y links
- Cards (beneficios, features, casos de uso)
- Pasos (“Cómo funciona”)
- FAQ (preguntas y respuestas)
- Secciones: activar/desactivar
- Orden básico (mover arriba/abajo donde aplique)
- Imágenes (hero/feature) y branding (logo light/dark, favicon)

---

## Desarrollo local

### Requisitos

- Node.js `>= 18`
- Backend CloudBox corriendo en `http://localhost:3001`

### Variables de entorno

Copiar `landing/.env.example` a `landing/.env` si quieres sobreescribir el valor:

- `VITE_API_URL`
  - Recomendado: `VITE_API_URL=/api` (mismo origen; en dev funciona con el proxy de Vite).
  - Alternativa: `VITE_API_URL=https://tu-backend.com/api` (si la landing vive en otro dominio).

### Comandos

Desde la raíz del repo:

- `npm run dev:landing` (sirve la landing en `http://localhost:5174`)
- `npm run build:landing`
- `npm run dev:all` (backend + app + landing)

O dentro de la carpeta:

- `cd landing`
- `npm run dev`

---

## Deployment

### Opción recomendada (sin CORS): landing y backend en el mismo origen

- Sirve los estáticos de `landing/dist/`.
- Asegúrate de **proxyear** `/api` al backend (Express).
- Mantén `VITE_API_URL=/api`.

### Opción multi-dominio (landing y backend separados)

- Construye la landing (`npm run build:landing`) y publica `landing/dist/` en tu hosting.
- Configura `VITE_API_URL` con el endpoint real del backend, por ejemplo: `https://api.cloudbox.lat/api`.
- Ajusta CORS del backend para permitir el origen de la landing en producción (`backend/src/index.ts:1` usa `FRONTEND_URL` como allowlist).
- En el editor `/admin/landing`, configura links absolutos (ej. `https://cloudbox.lat/login`) si tu app/login está en otro dominio.

### Nota sobre SPA routing

Si sirves la landing con Nginx/Caddy, configura fallback de rutas a `index.html` (típico de SPAs).

---

## Estructura de archivos (landing)

- `landing/src/pages/Landing.tsx`: render principal (secciones y layout).
- `landing/src/pages/landing/types.ts`: tipos del config.
- `landing/src/pages/landing/defaultConfig.ts`: fallback local (si falla el fetch).
- `landing/src/lib/api.ts`: helper `fetchJson`.
- `landing/src/lib/env.ts`: `VITE_API_URL`.
- `landing/src/lib/branding.ts`: favicon/título + resolver URLs.
- `landing/src/lib/theme.ts`: modo claro/oscuro.

---

## Troubleshooting rápido

- **La landing no carga contenido**: verifica que el backend esté arriba y que `VITE_API_URL` apunte a `/api` (dev con proxy) o a tu backend real.
- **No se ven logos/favicon**: revisa que el backend pueda servir `/api/admin/settings/branding` y que existan archivos en storage.
- **403/“Not allowed by CORS” en producción**: añade el dominio de la landing a la allowlist de CORS del backend.

