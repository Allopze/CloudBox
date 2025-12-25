FASE 1-2 AUDITORIA TECNICA - CloudBox

1) Resumen ejecutivo (10-15 lineas)
- Estado general: base solida (Express + Prisma + Vite), pero hay gaps criticos en uploads/compresion.
- Riesgo 1: /create-empty permite crear archivos sin cuota ni actualizacion de storageUsed.
- Riesgo 2: upload-with-folders permite archivos > maxFileSize.
- Riesgo 3: uploads directos ignoran tempStorage y permiten exceder cuota con chunked en paralelo.
- Riesgo 4: path traversal en compresion (outputName) y 7z extract sin validacion previa.
- Riesgo 5: IDOR en decompress por targetFolderId sin validar ownership.
- Quick wins: validar outputName, targetFolderId, incluir tempStorage y corregir create-empty.
- Observabilidad parcial: existe /api/metrics pero metricsMiddleware no se registra.
- Seguridad base OK (JWT, rate limit, CSP) con huecos puntuales.
- Tests backend existen (auth/files/folders/shares/admin/upload), frontend sin tests propios.
- Recomendacion: corregir 5 issues High antes de produccion.

2) Tabla corta de prioridades (Top 10 bugs)
| ID | Severidad | Componente | Titulo |
|---|---|---|---|
| BUG-001 | High | Backend, Storage | /create-empty salta cuota y no actualiza storageUsed |
| BUG-002 | High | Backend, Storage | upload-with-folders permite archivos > maxFileSize |
| BUG-003 | Medium | Backend, Storage | Upload directo ignora tempStorage |
| BUG-004 | Medium | Backend, Storage | Tamaños de carpeta se inflan al restaurar |
| BUG-005 | High | Backend, Auth | IDOR en targetFolderId (decompress) |
| BUG-006 | High | Backend, Storage | Path traversal via outputName en compresion |
| BUG-007 | High | Backend, Storage | 7z extract sin validacion previa de rutas |
| BUG-008 | Low | Backend, Observabilidad | metricsMiddleware no registrado |
| BUG-009 | Low | Backend | Descarga sin manejo de errores de stream |
| BUG-010 | Medium | Backend, Storage | Nombres no saneados en ZIP/compresion |

3) Lista completa de bugs (formato BUG-###)
- ID: BUG-001
- Severidad: High
- Componente: Backend | Storage
- Ubicacion exacta: backend/src/routes/files.ts (router.post('/create-empty'))
- Descripcion: crea archivo en disco y DB sin validar cuota, maxFileSize ni extensiones peligrosas, y no incrementa storageUsed ni sizes de carpeta.
- Pasos para reproducir:
  1) Configura cuota baja.
  2) POST /api/files/create-empty repetidas veces con content grande.
  3) storageUsed no cambia y se pueden crear archivos ilimitados.
- Impacto: bypass de cuota y crecimiento de disco sin control.
- Evidencia: create-empty no llama updateParentFolderSizes ni actualiza storageUsed.
- Fix propuesto: aplicar validaciones de /upload; actualizar storageUsed y sizes de carpeta.
- Pruebas sugeridas: integration test de create-empty (quota, maxFileSize, extension peligrosa).

- ID: BUG-002
- Severidad: High
- Componente: Backend | Storage
- Ubicacion exacta: backend/src/routes/files.ts (router.post('/upload-with-folders'))
- Descripcion: valida cuota total pero no valida maxFileSize por archivo.
- Pasos para reproducir:
  1) maxFileSize = 1MB.
  2) Subir archivo 50MB con drag&drop de carpeta.
  3) El backend lo acepta.
- Impacto: se suben archivos fuera de limites.
- Evidencia: no hay check file.size > user.maxFileSize en upload-with-folders.
- Fix propuesto: agregar validacion por archivo y limite total como en /upload.
- Pruebas sugeridas: integration test con archivo mayor al max.

- ID: BUG-003
- Severidad: Medium
- Componente: Backend | Storage
- Ubicacion exacta: backend/src/routes/files.ts (/upload y /upload-with-folders)
- Descripcion: calculo de cuota no descuenta tempStorage reservado por chunked uploads.
- Pasos para reproducir:
  1) POST /upload/init para reservar tempStorage.
  2) Subir archivos con /upload.
  3) Se supera la cuota total sin bloqueo.
- Impacto: exceso de cuota en escenarios concurrentes.
- Evidencia: /upload usa storageQuota - storageUsed; /upload/init usa storageQuota - storageUsed - tempStorage.
- Fix propuesto: descontar tempStorage en uploads directos.
- Pruebas sugeridas: integration test concurrente (init + upload).

- ID: BUG-004
- Severidad: Medium
- Componente: Backend | Storage
- Ubicacion exacta: backend/src/routes/trash.ts (restore file)
- Descripcion: al restaurar se incrementa size, pero al mover a trash no se decrementa, causando inflacion.
- Pasos para reproducir:
  1) Subir archivo a carpeta.
  2) Eliminar (soft) y luego restaurar.
  3) folder.size aumenta mas de lo real.
- Impacto: sizes inconsistentes y UX incorrecta.
- Evidencia: delete soft no decrementa size; restore si incrementa.
- Fix propuesto: decrementar size al mover a trash o evitar incremento en restore.
- Pruebas sugeridas: test delete->restore con size correcto.

- ID: BUG-005
- Severidad: High
- Componente: Backend | Auth
- Ubicacion exacta: backend/src/routes/compression.ts (router.post('/decompress'))
- Descripcion: targetFolderId no se valida con userId; permite escribir en carpeta ajena.
- Pasos para reproducir:
  1) Conocer folderId de otro usuario.
  2) POST /compression/decompress con targetFolderId ajeno.
  3) Extraccion en carpeta de otro usuario.
- Impacto: IDOR y escritura en recursos ajenos.
- Evidencia: targetFolderId se usa sin verificar ownership.
- Fix propuesto: validar folderId por userId antes de extraer.
- Pruebas sugeridas: integration con 2 usuarios y 403.

- ID: BUG-006
- Severidad: High
- Componente: Backend | Storage
- Ubicacion exacta: backend/src/routes/compression.ts (outputName)
- Descripcion: outputName no se sanitiza y se usa en getTempPath; permite ../ o paths absolutos.
- Pasos para reproducir:
  1) POST /compression/compress con outputName=../outside.
  2) El zip se crea fuera de temp.
- Impacto: path traversal y escritura fuera del storage.
- Evidencia: outputName se concatena sin sanitizeFilename/path.basename.
- Fix propuesto: sanitizar y rechazar nombres con path separators.
- Pruebas sugeridas: unit/integration validando outputName.

- ID: BUG-007
- Severidad: High
- Componente: Backend | Storage
- Ubicacion exacta: backend/src/lib/compression.ts (extract7z)
- Descripcion: extraccion 7z no valida rutas antes de escribir; validacion posterior no evita writes fuera.
- Pasos para reproducir:
  1) Crear 7z con entradas ../.
  2) POST /compression/decompress.
  3) Archivos escritos fuera del target.
- Impacto: path traversal y escritura fuera del storage.
- Evidencia: spawn('7z' ...) sin listado/validacion previa.
- Fix propuesto: listar entradas (7z l -slt) y validar rutas antes de extraer.
- Pruebas sugeridas: test con 7z malicioso.

- ID: BUG-008
- Severidad: Low
- Componente: Backend | Observabilidad
- Ubicacion exacta: backend/src/index.ts (metricsMiddleware importado pero no usado)
- Descripcion: metrics HTTP custom no se registran.
- Pasos para reproducir:
  1) Hacer requests.
  2) GET /api/metrics.
  3) No aparecen contadores custom.
- Impacto: observabilidad incompleta.
- Evidencia: no hay app.use(metricsMiddleware()).
- Fix propuesto: registrar metricsMiddleware antes de rutas.
- Pruebas sugeridas: e2e verificando incremento de cloudbox_http_requests_total.

- ID: BUG-009
- Severidad: Low
- Componente: Backend
- Ubicacion exacta: backend/src/routes/files.ts (download Range)
- Descripcion: stream no maneja errores ni close; puede dejar sockets colgados.
- Pasos para reproducir:
  1) Iniciar download con Range.
  2) Borrar archivo mientras se descarga.
  3) Conexion inestable o error sin respuesta.
- Impacto: UX mala y recursos colgados.
- Evidencia: createReadStream(...).pipe(res) sin error handlers.
- Fix propuesto: usar streamFile o agregar handlers de error/close.
- Pruebas sugeridas: test de descarga con IO error.

- ID: BUG-010
- Severidad: Medium
- Componente: Backend | Storage
- Ubicacion exacta: backend/src/routes/files.ts (rename), backend/src/routes/folders.ts (create), backend/src/routes/compression.ts (copyFolderContents)
- Descripcion: nombres de archivo/carpeta no se sanean y se usan en rutas de ZIP/compresion.
- Pasos para reproducir:
  1) Renombrar archivo a ../evil.txt.
  2) Descargar carpeta como ZIP o comprimir.
  3) Zip contiene rutas con traversal o copia fuera del target.
- Impacto: zip-slip para el consumidor y path traversal en server.
- Evidencia: archive.file(... name: `${archivePath}/${file.name}`) y path.join(targetPath, f.name).
- Fix propuesto: sanitizeFilename en rename/create y usar path.basename al construir rutas.
- Pruebas sugeridas: unit test contra ../ en rename.

4) Tabla corta de prioridades (Top 10 nice-to-have)
| ID | Prioridad | Area | Titulo |
|---|---|---|---|
| NTH-001 | P1 | Storage | Checksums por chunk y hash final |
| NTH-002 | P1 | Seguridad | Validar tipo por firma (content sniffing) |
| NTH-003 | P1 | Performance | Rate limit de descargas/streams |
| NTH-004 | P2 | Observabilidad | Request ID y logging estructurado global |
| NTH-005 | P2 | Storage | Reconciliacion DB vs disco |
| NTH-006 | P2 | UX | Reanudacion de uploads chunked |
| NTH-007 | P2 | Admin | UI para limites de upload |
| NTH-008 | P3 | Seguridad | Escaneo antivirus en uploads |
| NTH-009 | P3 | DevEx | Tests de seguridad compresion/extraccion |
| NTH-010 | P3 | UX | Panel admin de auditoria/actividad |

5) Lista completa de nice-to-have (formato NTH-###)
- ID: NTH-001
- Prioridad: P1
- Area: Storage
- Descripcion corta: Checksums por chunk y hash final del archivo.
- Beneficio para el usuario/administrador: detectar corrupcion en uploads y garantizar integridad.
- Requisitos tecnicos: actualizar chunked upload backend y frontend; agregar columna hash en Prisma.
- Riesgos/consideraciones: costo CPU y almacenamiento.
- Plan de implementacion:
  1) Agregar campo fileHash en File.
  2) Calcular hash por chunk y validar en merge.
  3) Exponer hash en API.
  4) Mostrar verificacion en UI.
- Metrica de exito: 0 archivos con mismatch post-upload.

- ID: NTH-002
- Prioridad: P1
- Area: Seguridad
- Descripcion corta: Validar tipo por firma real del archivo.
- Beneficio para el usuario/administrador: evita spoofing de tipos peligrosos.
- Requisitos tecnicos: libreria de file signatures; integrar en upload.
- Riesgos/consideraciones: dependencia nativa.
- Plan de implementacion:
  1) Integrar detector de firma.
  2) Validar en /upload y /upload-with-folders.
  3) Rechazar inconsistencias.
- Metrica de exito: % de archivos con MIME inconsistente bloqueados.

- ID: NTH-003
- Prioridad: P1
- Area: Performance
- Descripcion corta: Rate limit de descargas/streams por usuario.
- Beneficio para el usuario/administrador: evita abuso y reduce picos.
- Requisitos tecnicos: middleware en routes files y shares.
- Riesgos/consideraciones: falsos positivos en descargas masivas.
- Plan de implementacion:
  1) Agregar userRateLimiter en descargas.
  2) Configurar umbrales por env.
  3) Exponer metricas.
- Metrica de exito: picos de descarga controlados sin degradar UX.

- ID: NTH-004
- Prioridad: P2
- Area: Observabilidad
- Descripcion corta: Activar request ID y logging global.
- Beneficio para el usuario/administrador: trazabilidad de incidentes.
- Requisitos tecnicos: montar requestContextMiddleware en index.
- Riesgos/consideraciones: volumen de logs.
- Plan de implementacion:
  1) app.use(requestContextMiddleware) al inicio.
  2) Añadir req.id a logs criticos.
  3) Documentar en README.
- Metrica de exito: cada request con X-Request-ID.

- ID: NTH-005
- Prioridad: P2
- Area: Storage
- Descripcion corta: Reconciliacion DB vs disco en background.
- Beneficio para el usuario/administrador: corrige orfanos y drift de storageUsed.
- Requisitos tecnicos: script en backend/src/scripts y job programado.
- Riesgos/consideraciones: tiempo de ejecucion largo.
- Plan de implementacion:
  1) Escanear storage.path.
  2) Comparar con File.path.
  3) Reportar/limpiar.
- Metrica de exito: 0 orfanos tras ejecucion.

- ID: NTH-006
- Prioridad: P2
- Area: UX
- Descripcion corta: Reanudacion de uploads chunked interrumpidos.
- Beneficio para el usuario/administrador: menos fallos en archivos grandes.
- Requisitos tecnicos: endpoint status + frontend reanuda chunks.
- Riesgos/consideraciones: manejo de estados.
- Plan de implementacion:
  1) Endpoint /files/upload/status/:id.
  2) Frontend reintenta chunks faltantes.
  3) UI de reanudacion.
- Metrica de exito: % de uploads retomados con exito.

- ID: NTH-007
- Prioridad: P2
- Area: Admin
- Descripcion corta: UI para limites de upload (chunk size/concurrency).
- Beneficio para el usuario/administrador: tuning sin tocar DB.
- Requisitos tecnicos: settings existentes en /config/upload-limits.
- Riesgos/consideraciones: validacion de valores.
- Plan de implementacion:
  1) Form admin para settings.
  2) Validacion backend.
  3) Reflejar en frontend.
- Metrica de exito: cambios aplicados sin reinicio.

- ID: NTH-008
- Prioridad: P3
- Area: Seguridad
- Descripcion corta: Escaneo antivirus en uploads.
- Beneficio para el usuario/administrador: detectar malware temprano.
- Requisitos tecnicos: hook en upload + worker.
- Riesgos/consideraciones: latencia y costo.
- Plan de implementacion:
  1) Integrar ClamAV.
  2) Escaneo async con cola.
  3) Bloqueo de archivos sospechosos.
- Metrica de exito: ratio de detecciones registradas.

- ID: NTH-009
- Prioridad: P3
- Area: DevEx
- Descripcion corta: Tests de seguridad para compresion/extraccion.
- Beneficio para el usuario/administrador: prevencion de regresiones.
- Requisitos tecnicos: tests en backend/src/__tests__.
- Riesgos/consideraciones: fixtures grandes.
- Plan de implementacion:
  1) Crear fixtures con ../
  2) Verificar bloqueo.
  3) Integrar en CI.
- Metrica de exito: tests fallan ante Zip Slip.

- ID: NTH-010
- Prioridad: P3
- Area: UX
- Descripcion corta: Panel admin de auditoria/actividad.
- Beneficio para el usuario/administrador: visibilidad de eventos criticos.
- Requisitos tecnicos: endpoint paginado en admin + UI.
- Riesgos/consideraciones: volumen de datos.
- Plan de implementacion:
  1) Endpoint Activity paginado.
  2) UI con filtros.
  3) Export CSV.
- Metrica de exito: admin consulta en <2s.

6) Checklist final listo para produccion
- [ ] Corregir bypass de cuota en /create-empty y upload-with-folders.
- [ ] Validar targetFolderId y sanitizar outputName.
- [ ] Mitigar Zip Slip en 7z y nombres en ZIP/compresion.
- [ ] Incluir tempStorage en quota de uploads directos.
- [ ] Corregir sizes de carpeta en trash/restore.
- [ ] Activar metricsMiddleware y logging de request ID.
- [ ] Añadir tests para compresion/extraccion y create-empty.
- [ ] Documentar limites de uploads y ajustes de admin.
