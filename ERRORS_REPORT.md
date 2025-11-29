# Informe de Errores - 29 Nov 2025

## Backend

1. **`generateRandomToken` usa APIs específicas del navegador**
   - **Ubicación:** `backend/src/lib/jwt.ts`, función `generateRandomToken`
   - **Detalle:** Se invoca `crypto.getRandomValues` sin importar `crypto` y sin habilitar librerías DOM en TypeScript. En Node 18+ no existe ese símbolo en el espacio global tipado, por lo que `tsc` no compila y en runtime antiguos falla con `ReferenceError`.
   - **Impacto:** El backend no puede compilar ni emitir tokens de verificación, bloqueando registro y recuperación de contraseña.
   - **Recomendación:** Importar `randomBytes` de `node:crypto` y usar `randomBytes(32).toString('hex')` para mantener compatibilidad con Node.

2. **El limitador global no excluye realmente el healthcheck**
   - **Ubicación:** `backend/src/index.ts`, configuración de `globalLimiter`
   - **Detalle:** Se monta el limitador en `app.use('/api/', globalLimiter)` pero el `skip` compara `req.path === '/api/health'`. Dentro del middleware el `req.path` ya no incluye `/api`, por lo que `/api/health` sigue rate-limitado y puede devolver 429.
   - **Impacto:** Sondeos de salud en producción fallan aleatoriamente, provocando reinicios falsos o alarmas.
   - **Recomendación:** Comparar contra `req.originalUrl` o montar el limitador con una excepción explícita (`app.get('/api/health', ...)` antes del limitador o usar `req.path === '/health'`).

3. **Los tamaños de carpetas quedan desfasados tras limpiar la papelera**
   - **Ubicación:** `backend/src/index.ts` (`cleanupTrash`) y `backend/src/routes/trash.ts` (`DELETE /api/trash/empty`)
   - **Detalle:** Al borrar definitivamente archivos expirados o vaciar la papelera se eliminan los registros y se descuenta `storageUsed`, pero nunca se invoca `updateParentFolderSizes`. Las carpetas mantienen tamaños antiguos.
   - **Impacto:** El front muestra tamaños de carpetas incorrectos, lo que confunde al usuario y rompe cálculos de cuota por carpeta.
   - **Recomendación:** Antes de borrar cada archivo, llamar a `updateParentFolderSizes(file.folderId, file.size, tx, 'decrement')` (idealmente en la misma transacción que el borrado).

4. **El desempaquetado ignora completamente las cuotas**
   - **Ubicación:** `backend/src/routes/compression.ts`, handler `POST /api/compression/decompress`
   - **Detalle:** Se crean archivos según el contenido del ZIP sin comprobar `storageQuota` ni `maxFileSize`. Basta subir un ZIP pequeño para rebasar almacenamiento ilimitadamente.
   - **Impacto:** Usuarios pueden evadir cuotas y consumir todo el disco del servidor.
   - **Recomendación:** Antes de procesar, sumar el tamaño total extraído y validar contra la cuota y límites de archivo. Abortarlo si supera los topes.

5. **Las carpetas temporales usadas para comprimir nunca se eliminan**
   - **Ubicación:** `backend/src/routes/compression.ts`, handler `POST /api/compression/compress`
   - **Detalle:** Al comprimir una carpeta se clona su contenido en `getTempPath('folder_${folder.id}')`, pero tras mover el archivo comprimido no se borra esa copia temporal.
   - **Impacto:** Cada compresión deja una copia completa ocupando disco indefinidamente.
   - **Recomendación:** Tras finalizar la compresión (tanto en éxito como en error), eliminar con `fs.rm(tempFolderPath, { recursive: true, force: true })`.

6. **Las contraseñas de enlaces públicos no se aplican en el listado**
   - **Ubicación:** `backend/src/routes/shares.ts`, `GET /api/shares/public/:token`
   - **Detalle:** El endpoint retorna metadatos aunque exista contraseña; nunca verifica la credencial ni devuelve 401. El frontend espera ese 401 para mostrar el formulario, de modo que los datos del share quedan expuestos sin password, mientras las descargas siguen bloqueadas.
   - **Impacto:** Filtra nombres/tamaños de archivos supuestamente protegidos y rompe el flujo del frontend.
   - **Recomendación:** Requerir una sesión de verificación previa (token temporal) o al menos devolver 401 hasta que se valide la contraseña vía `/verify`.

7. **No existe endpoint para actualizar un share existente**
   - **Ubicación:** `backend/src/routes/shares.ts`
   - **Detalle:** El frontend llama a `PATCH /api/shares/:id` para cambiar contraseña, expiración o límite de descargas, pero el backend no implementa ningún `PATCH` para shares.
   - **Impacto:** El botón “Actualizar configuración” de la UI siempre responde 404; los administradores no pueden modificar enlaces sin recrearlos.
   - **Recomendación:** Añadir un `PATCH /api/shares/:id` que valide propiedad y persista `password`, `expiresAt`, `downloadLimit`.

## Frontend

8. **La página de enlaces públicos asume un contrato inexistente**
   - **Ubicación:** `frontend/src/pages/public/PublicShare.tsx`
   - **Detalle:** `loadShare` espera que `GET /shares/public/:token` devuelva `{ share, files, folders }`, pero el backend sólo entrega metadatos simples. La vista accede a `data.files.length`, provocando errores en tiempo de ejecución y dejando la pantalla en blanco.
   - **Impacto:** Los destinatarios no pueden visualizar los contenidos compartidos.
   - **Recomendación:** Adaptar el componente al payload real (o implementar en backend el listado de ficheros). Mientras tanto, validar la estructura antes de usarla para evitar crashes.

9. **Descargas públicas usan URL equivocada y nunca envían la contraseña**
   - **Ubicación:** `frontend/src/pages/public/PublicShare.tsx`, funciones `downloadFile` y `downloadAll`
   - **Detalle:** Cuando falta `VITE_API_URL`, se cae al hardcode `http://localhost:4000/api`, mientras el backend por defecto corre en `3001`. Además, aunque se introduzca una contraseña, al abrir la descarga no se añade `?password=...` como requiere el backend.
   - **Impacto:** Descargas fallan (404/401) en entornos locales y ninguna compartición protegida puede descargarse.
   - **Recomendación:** Reutilizar `API_URL` y transmitir la contraseña confirmada como query (`/download?password=...`).

10. **El modal de compartir invoca un endpoint inexistente**
    - **Ubicación:** `frontend/src/components/modals/ShareModal.tsx`, función `updateShare`
    - **Detalle:** Ejecuta `api.patch('/shares/${id}')`, pero el backend carece de ese endpoint (ver hallazgo 7). Cada intento muestra un error.
    - **Impacto:** Los usuarios creen estar actualizando la configuración, pero nada cambia y se genera ruido en logs.
    - **Recomendación:** Hasta que exista el endpoint, deshabilitar el botón o reutilizar `POST /shares` con actualización; una vez implementado el API, ajustar la ruta correcta.

11. **El flujo de contraseña en enlaces públicos nunca se activa**
    - **Ubicación:** `frontend/src/pages/public/PublicShare.tsx`
    - **Detalle:** La UI sólo muestra el formulario si `GET /shares/public/:token` responde 401. Como el backend siempre devuelve 200 (ver hallazgo 6), la contraseña jamás se solicita y el usuario no puede descargar porque los endpoints posteriores sí la exigen.
    - **Impacto:** Enlaces protegidos quedan inutilizables: los archivos se listan pero las descargas siempre fallan con “Password required”.
    - **Recomendación:** Tras implementar la validación en backend, adaptar la UI para usar `/shares/public/:token/verify` y almacenar un estado “verificado” que se reenvíe al descargar.

12. **El menú contextual de música elimina sólo un archivo aunque indique múltiple selección**
    - **Ubicación:** `frontend/src/pages/Music.tsx`, handler `handleDelete`
    - **Detalle:** En selección múltiple, la etiqueta dice “Eliminar N canciones”, pero `handleDelete` siempre llama a `DELETE /files/:id` con el archivo del clic. El resto sigue allí.
    - **Impacto:** Los usuarios creen haber borrado varios archivos cuando sólo se eliminó uno, generando inconsistencias y retrabajo.
    - **Recomendación:** Si hay múltiples seleccionados, iterar sobre `selectedItems` (idealmente con un endpoint batch) y actualizar el listado en lote.

13. **Pre-cálculo de duraciones crea fugas de Audio()**
    - **Ubicación:** `frontend/src/pages/Music.tsx`, bucle `audioFiles.forEach`
    - **Detalle:** Se instancia `new Audio()` por cada pista y se agregan listeners `loadedmetadata` sin limpiar ni pausarlos.
    - **Impacto:** En bibliotecas grandes la página crea cientos de objetos Audio que siguen vivos tras navegar, consumiendo memoria y conexiones HTTP.
    - **Recomendación:** Reutilizar un único objeto `Audio`, limpiar eventos en `useEffect` cleanup o precalcular duraciones desde el backend.
