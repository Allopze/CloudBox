# CloudBox Implementation Plan (Performance)

Fecha: 2026-01-18

## Objetivos
- Percepción de “carga instantánea” en rutas críticas.
- Reducir TTFB en listados, previews y descargas.
- Minimizar re-renders y payloads en el cliente.

## Fase 0 — Baseline (0.5–1 día)
**Entregables**
- Script de medición (autocannon/k6) por endpoint clave.
- Lighthouse CI con rutas críticas.
- Dataset reproducible (10k/100k items + PDFs).

**Acciones**
- Definir rutas y escenarios de prueba.
- Capturar métricas before/after.

## Fase 1 — Quick Wins (1–2 días)
**Objetivo:** Impacto alto, riesgo bajo.

**Acciones**
1) Validar mejoras aplicadas y medir impacto.
2) Revisar headers de assets y habilitar Brotli en proxy.
3) Asegurar `Cache-Control`/`ETag` en thumbnails y assets.

**Estado**
- Hecho: headers + compresión zstd/gzip en [frontend/Caddyfile](../frontend/Caddyfile).
- Hecho: `ETag` en thumbnails de shares privados en [backend/src/routes/shares.ts](../backend/src/routes/shares.ts).
- Pendiente: medición before/after (Lighthouse CI + autocannon/k6).

**Resultados esperados**
- Menos requests duplicados.
- Mejor INP/TTI en listados.
- Mejor cache hit de thumbnails.

## Fase 2 — Core Optimizations (1–2 semanas)
**Objetivo:** Reducir latencia en listados y navegación.

**Acciones**
1) Implementar cursor pagination en `/api/files`.
2) Respuestas “light” para listados (campos mínimos).
3) Prefetch inteligente por hover/idle en navegación de carpetas.
4) UI optimista rename/move/delete con rollback.
5) Cache Redis para búsqueda y listados populares.

**Resultados esperados**
- p50/p95 TTFB más bajos.
- Navegación percibida instantánea.

## Fase 3 — Previews y Media (2–4 semanas)
**Objetivo:** Previews inmediatas con consumo controlado.

**Acciones**
1) Pre-generación asíncrona de thumbnails (cola con prioridad).
2) Streaming progresivo de PDF (range requests + caché).
3) LQIP + blur-up consistente para imágenes.

**Resultados esperados**
- Previews rápidas sin bloquear UI.
- Menor CPU en clientes y servidor.

## Fase 4 — Refactor estructural (1–2 meses)
**Objetivo:** Plataforma robusta para escala.

**Acciones**
1) Unificar viewers duplicados (DocumentViewer/MediaViewer).
2) Consolidar cache cliente con React Query/SWR para listados.
3) Instrumentación APM mínima (pino + histograms + dashboards).

**Resultados esperados**
- Mantenimiento más simple.
- Observabilidad por p95/p99.

## Criterios de aceptación
- LCP: reducción ≥ 20% en rutas críticas.
- INP: < 200 ms en listados con 10k items.
- TTFB p95: reducción ≥ 30% en `/api/files` y `/api/files/search`.
- Cache hit de thumbnails ≥ 80%.

## Riesgos y mitigaciones
- Cambios de pagination afectan UI: feature flag y fallback a offset.
- Cache inconsistente: invalidación por eventos (uploads/moves/deletes).
- Carga de previews: lazy + backpressure + límites de concurrencia.

## Checklist de rollout
- Feature flags por módulo.
- Métricas before/after capturadas.
- Plan de rollback validado.
- Monitoreo activo las primeras 72h.
