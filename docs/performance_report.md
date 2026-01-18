# CloudBox Performance Report (Baseline + Quick Wins)

Fecha: 2026-01-18

## Resumen ejecutivo (quick wins aplicados)
1) Precarga de config de uploads para eliminar latencia en el primer upload: [frontend/src/main.tsx](../frontend/src/main.tsx).
2) Cache LRU de URLs blob para `AuthenticatedImage` y `useAuthenticatedUrl` (menos requests y re-descargas): [frontend/src/components/AuthenticatedImage.tsx](../frontend/src/components/AuthenticatedImage.tsx).
3) Carga en paralelo + cancelación de requests en `Files` para reducir TTI y evitar renders obsoletos: [frontend/src/pages/Files.tsx](../frontend/src/pages/Files.tsx).
4) Virtualización de resultados de búsqueda para listas grandes: [frontend/src/pages/SearchResults.tsx](../frontend/src/pages/SearchResults.tsx).
5) `DocumentThumbnail` ahora carga previews solo cuando están en viewport: [frontend/src/components/files/DocumentThumbnail.tsx](../frontend/src/components/files/DocumentThumbnail.tsx).

## A) Top 20 mejoras priorizadas
| # | Mejora | Impacto | Esfuerzo | Riesgo | Métrica | Estado |
|---|---|---|---|---|---|---|
| 1 | Requests paralelos/cancelación en Files | Alto | Bajo | Bajo | TTI/INP | Aplicado |
| 2 | Virtualización en Search | Alto | Bajo | Bajo | INP/CPU | Aplicado |
| 3 | Lazy previews DocumentThumbnail | Alto | Bajo | Bajo | CPU/TTI | Aplicado |
| 4 | Cache LRU para blobs autenticados | Medio | Bajo | Bajo | Requests/cache hit | Aplicado |
| 5 | Precarga config uploads | Medio | Bajo | Bajo | Tiempo 1er upload | Aplicado |
| 6 | Cursor pagination en `/files` | Alto | Medio | Bajo | TTFB/p95 | Propuesto |
| 7 | Respuestas “light” en listados | Alto | Medio | Medio | Payload/TTFB | Propuesto |
| 8 | Cache Redis búsqueda `/files/search` | Medio | Medio | Bajo | p95 | Propuesto |
| 9 | Batch de signed URLs (thumbnails) | Medio | Medio | Bajo | Requests | Propuesto |
|10 | Prefetch inteligente (hover/idle) | Medio | Medio | Bajo | Latencia navegación | Propuesto |
|11 | UI optimista rename/move/delete | Medio | Medio | Bajo | INP | Propuesto |
|12 | LQIP/blur-up consistente | Medio | Bajo | Bajo | LCP/CLS | Propuesto |
|13 | Previews doc solo visible+idle | Medio | Bajo | Bajo | CPU | Propuesto |
|14 | Cache-Control immutable assets | Alto | Bajo | Bajo | Cache hit | Propuesto |
|15 | Brotli en proxy | Alto | Bajo | Bajo | LCP/TTFB | Propuesto |
|16 | ETag shares públicos | Medio | Bajo | Bajo | Bandwidth | Propuesto |
|17 | Pregeneración thumbnails async | Medio | Medio | Bajo | Preview latency | Propuesto |
|18 | Streaming PDF con range | Medio | Alto | Medio | TTFB | Propuesto |
|19 | Consolidar viewers duplicados | Bajo | Medio | Bajo | Bundle | Propuesto |
|20 | Instrumentación APM mínima | Medio | Medio | Bajo | Visibilidad | Propuesto |

## B) Hallazgos con referencias
- `Files` hacía requests secuenciales (files → folders → breadcrumb). Ahora paralelo/cancelado: [frontend/src/pages/Files.tsx](../frontend/src/pages/Files.tsx).
- `SearchResults` renderizaba listas completas sin virtualización: [frontend/src/pages/SearchResults.tsx](../frontend/src/pages/SearchResults.tsx).
- `DocumentThumbnail` hacía trabajo pesado al montar cada card: [frontend/src/components/files/DocumentThumbnail.tsx](../frontend/src/components/files/DocumentThumbnail.tsx).
- `AuthenticatedImage` re-descargaba blobs por montaje: [frontend/src/components/AuthenticatedImage.tsx](../frontend/src/components/AuthenticatedImage.tsx).
- Listados backend usan paginación por offset; candidatas a cursor: [backend/src/routes/files.ts](../backend/src/routes/files.ts).

## C) Cambios listos para PR (aplicados)
1) Precarga config uploads: [frontend/src/main.tsx](../frontend/src/main.tsx).
2) Cache LRU blobs autenticados: [frontend/src/components/AuthenticatedImage.tsx](../frontend/src/components/AuthenticatedImage.tsx).
3) Paralelización/cancelación de loadData: [frontend/src/pages/Files.tsx](../frontend/src/pages/Files.tsx).
4) Virtualización Search: [frontend/src/pages/SearchResults.tsx](../frontend/src/pages/SearchResults.tsx).
5) Lazy DocumentThumbnail: [frontend/src/components/files/DocumentThumbnail.tsx](../frontend/src/components/files/DocumentThumbnail.tsx).

## D) Plan de medición before/after
Frontend
- Lighthouse CI: LCP, INP, CLS, TTI.
- Bundle size, requests, waterfall, cache hit.
- Rutas: login, files root, carpeta con 10k items, search con filtros, preview PDF.

Backend
- TTFB por endpoint, p50/p95, throughput, CPU/RAM, I/O disco, queries p50/p95.
- Endpoints: `/api/files`, `/api/files/search`, `/api/files/:id/thumbnail`, `/api/files/:id/view`, `/api/files/upload*`.
- Herramientas: autocannon/k6 + métricas `/api/admin/metrics`.

Dataset
- Carpeta con 10k/100k archivos + thumbnails.
- 1k PDFs para stress de previews.

## E) Roadmap
Quick wins (1–2 días)
- Aplicados: 1–5 arriba.
- Revisar headers de assets en [frontend/Caddyfile](../frontend/Caddyfile).

Medium (1–2 semanas)
- Cursor pagination + respuestas “light”.
- Prefetch inteligente por hover/idle.
- UI optimista rename/move/delete.
- Cache Redis para búsqueda y prewarming de thumbnails.

Deep refactor (1–2 meses)
- Pipeline de thumbnails/previews con prioridad por visibilidad.
- Estrategia de cache cliente (React Query/SWR) en listados.
- Unificación de viewers y streaming progresivo.

## F) Checklist de performance regression
- Lighthouse CI en rutas críticas.
- Bundle analyzer en build frontend.
- Pruebas de carga (k6/autocannon) por endpoint clave.
- Verificar Cache-Control/ETag en thumbnails y assets.
- Validar range requests en media/descargas.
- Pruebas de uploads (chunked/direct) con retries.

## Rutas críticas (referencia)
- Login/refresh: [backend/src/routes/auth.ts](../backend/src/routes/auth.ts).
- Files/folders: [backend/src/routes/files.ts](../backend/src/routes/files.ts), [backend/src/routes/folders.ts](../backend/src/routes/folders.ts).
- Search: [backend/src/routes/files.ts](../backend/src/routes/files.ts).
- Preview/stream/thumbnail: [backend/src/routes/files.ts](../backend/src/routes/files.ts), `streamFile` en [backend/src/lib/storage.ts](../backend/src/lib/storage.ts).
- Shares: [backend/src/routes/shares.ts](../backend/src/routes/shares.ts).
