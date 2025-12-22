# UI/UX audit CloudBox (code-based)

## Resumen ejecutivo
- Stack UI: React + React Router + Tailwind + Zustand + framer-motion + React Query. Evidencia: frontend/src/main.tsx:L1-L43 (BrowserRouter y QueryClient), frontend/src/App.tsx:L1-L52 (Routes, lazy/Suspense), frontend/src/index.css:L1-L83 (Tailwind layers), frontend/src/stores/fileStore.ts:L1-L157 (zustand store), frontend/src/components/ui/Button.tsx:L1-L54 (framer-motion).
- Ruteo y grupos de pantallas con lazy loading para paginas secundarias y pesadas. Evidencia: frontend/src/App.tsx:L14-L129 (lazy + rutas public/auth/protected/admin).
- Sistema visual con paleta primary roja y escala dark, mas base claro/oscuro y branding dinamico. Evidencia: frontend/tailwind.config.js:L10-L35 (tokens), frontend/src/index.css:L10-L12 (base body), frontend/src/stores/brandingStore.ts:L20-L27 (primaryColor), frontend/src/layouts/MainLayout.tsx:L169-L178 (accentColor).
- Libreria UI propia (Button/Input/Modal/Dropdown/ContextMenu/Toast/Progress) como base comun. Evidencia: frontend/src/components/ui/Button.tsx:L6-L58, frontend/src/components/ui/Input.tsx:L4-L64, frontend/src/components/ui/Modal.tsx:L14-L82, frontend/src/components/ui/Dropdown.tsx:L27-L175, frontend/src/components/ui/ContextMenu.tsx:L32-L223, frontend/src/components/ui/Toast.tsx:L5-L133, frontend/src/components/ui/Progress.tsx:L11-L38.
- UX de archivos con sort + toggle grid/list, toolbar de seleccion y acciones rapidas en cards. Evidencia: frontend/src/layouts/MainLayout.tsx:L1239-L1315 (sort/toggle), frontend/src/components/Header.tsx:L252-L288 (selection toolbar), frontend/src/pages/Files.tsx:L309-L348 (grid/list), frontend/src/components/files/FileCard.tsx:L212-L238 (acciones), frontend/src/components/files/FileCard.tsx:L330-L368 (quick actions).
- Upload con dropzone, validacion, chunked upload paralelo con retry y feedback de progreso. Evidencia: frontend/src/components/modals/UploadModal.tsx:L75-L175 (validacion/concurrencia), frontend/src/components/modals/UploadModal.tsx:L270-L353 (dropzone/lista/progreso), frontend/src/lib/chunkedUpload.ts:L14-L23 (config), frontend/src/lib/chunkedUpload.ts:L451-L466 (concurrency), frontend/src/components/UploadProgress.tsx:L24-L96 (panel), frontend/src/layouts/MainLayout.tsx:L1358-L1364 (overlay global).
- Viewers dedicados para imagen/video/documento con teclado, zoom y paneles. Evidencia: frontend/src/components/gallery/ImageGallery.tsx:L95-L200, frontend/src/components/gallery/VideoPreview.tsx:L42-L167, frontend/src/components/gallery/DocumentViewer.tsx:L84-L194.
- i18n configurado con multiples idiomas, pero hay fechas fijas en es-ES y textos no traducidos. Evidencia: frontend/src/i18n.ts:L23-L43 (i18n), frontend/src/lib/utils.ts:L38-L55 (es-ES fijo), frontend/src/components/UploadProgress.tsx:L31-L35 (string literal).
- Accesibilidad mixta: Inputs y ContextMenu con aria, pero Modal/Dropdown/Tabs/Tooltip sin roles/focus trap. Evidencia: frontend/src/components/ui/Input.tsx:L21-L64, frontend/src/components/ui/ContextMenu.tsx:L111-L176, frontend/src/components/ui/Modal.tsx:L22-L58, frontend/src/components/ui/Dropdown.tsx:L117-L135, frontend/src/components/ui/Tabs.tsx:L34-L76, frontend/src/components/ui/Tooltip.tsx:L179-L196.
- Inconsistencias visibles (toasts duplicados, clases de animacion faltantes, colores hardcoded, mojibake). Evidencia: frontend/src/main.tsx:L31-L39 (Toaster), frontend/src/App.tsx:L143-L144 (ToastContainer), frontend/src/components/ui/Toast.tsx:L93-L99 (animate-slide-in), frontend/src/index.css:L280-L294 (animate-toast-slide-in), frontend/src/layouts/LegalLayout.tsx:L41-L52 (color hardcoded), frontend/src/pages/Settings.tsx:L376-L418 (color hardcoded), frontend/src/pages/auth/Login.tsx:L295-L299 (mojibake), frontend/src/components/files/FileCard.tsx:L309-L312 (mojibake), frontend/src/components/modals/UploadModal.tsx:L319-L325 (mojibake).

## Mapa de pantallas y navegacion
- Publico: /share/:token usa PublicShare. Evidencia: frontend/src/App.tsx:L93-L95 (ruta), frontend/src/pages/public/PublicShare.tsx:L32-L41 (componente).
- Legal: /privacy y /terms bajo LegalLayout. Evidencia: frontend/src/App.tsx:L96-L99 (rutas), frontend/src/layouts/LegalLayout.tsx:L23-L121 (layout).
- Auth: /login, /register, /forgot-password, /reset-password/:token, /verify-email/:token bajo AuthLayout con transicion. Evidencia: frontend/src/App.tsx:L101-L108 (rutas), frontend/src/layouts/AuthLayout.tsx:L30-L76 (animacion).
- App protegida: index Dashboard y rutas /files, /files/:folderId, /favorites, /shared, /trash, /photos, /albums, /albums/:albumId, /music, /documents, /settings. Evidencia: frontend/src/App.tsx:L110-L125.
- Admin: /admin y /admin/users bajo AdminRoute. Evidencia: frontend/src/App.tsx:L126-L128.
- Fallback: redireccion a /. Evidencia: frontend/src/App.tsx:L131-L132.
- Navegacion principal: sidebar con items configurables (dashboard/files/documents/photos/music/shared) y bottom (trash/settings), mas barra de storage. Evidencia: frontend/src/stores/sidebarStore.ts:L19-L31 (items), frontend/src/components/Sidebar.tsx:L450-L470 (render + storage).
- Navegacion superior: buscador con debounce y alcance limitado a /files, /photos, /music, /documents; menu Nuevo. Evidencia: frontend/src/components/Header.tsx:L74-L119 (debounce + rutas), frontend/src/components/Header.tsx:L205-L248 (search + dropdown).
- Navegacion por carpetas: breadcrumbs con targets droppable. Evidencia: frontend/src/components/files/Breadcrumbs.tsx:L19-L83.
- Elementos globales: MusicPlayer, GlobalProgressIndicator y ToastContainer presentes en todas las pantallas. Evidencia: frontend/src/App.tsx:L135-L144.

## Sistema visual extraido del codigo (tokens y reglas)
- Colores primary definidos (rojos 50-950, primary-600 #dc2626). Evidencia: frontend/tailwind.config.js:L10-L23.
- Paleta dark/neutra definida (dark-50..950). Evidencia: frontend/tailwind.config.js:L24-L35.
- Base claro/oscuro en body y darkMode por clase. Evidencia: frontend/src/index.css:L10-L12 (bg/text), frontend/tailwind.config.js:L7-L8 (darkMode), frontend/src/App.tsx:L79-L85 (toggle class).
- Acento dinamico por branding con fallback #dc2626 aplicado a seleccion. Evidencia: frontend/src/stores/brandingStore.ts:L20-L27 (default), frontend/src/layouts/MainLayout.tsx:L169-L178 (accentColor), frontend/src/layouts/MainLayout.tsx:L1344-L1348 (marquee color).
- Tipografia base system-ui; headings tipicos con text-2xl font-bold en auth. Evidencia: frontend/src/index.css:L10-L12, frontend/src/pages/auth/Login.tsx:L183-L189.
- Botones/inputs/cards con radios y sombras (rounded-lg/rounded-xl/shadow-sm) y focus ring primary. Evidencia: frontend/src/index.css:L32-L59 (btn/input/card), frontend/src/components/ui/Button.tsx:L28-L39 (variants), frontend/src/components/ui/Input.tsx:L45-L50 (error/focus).
- Modales con rounded-2xl y shadow-2xl en clases base; Modal component usa rounded-3xl. Evidencia: frontend/src/index.css:L77-L83, frontend/src/components/ui/Modal.tsx:L55-L58.
- File cards premium con estados hover/selected, scale y acciones en hover. Evidencia: frontend/src/index.css:L93-L214, frontend/src/components/files/FileCard.tsx:L330-L368.
- Espaciado y grid: botones con px-4/py-2; grillas de archivos con grid-cols-2 md-4 lg-5 xl-6. Evidencia: frontend/src/index.css:L32-L35, frontend/src/pages/Files.tsx:L309-L313.
- Animaciones: fadeIn, dropdownIn, pageIn, toastSlideIn y reduced motion; animaciones extendidas en Tailwind. Evidencia: frontend/src/index.css:L231-L304, frontend/tailwind.config.js:L38-L52.
- Iconografia consistente con lucide-react en componentes base y paginas. Evidencia: frontend/src/pages/auth/Login.tsx:L7-L8, frontend/src/components/Header.tsx:L13-L20, frontend/src/components/ui/ConfirmModal.tsx:L1-L4.

## Libreria de componentes (inventario real)
- Controles base: Button, Input, Checkbox, Progress. Evidencia: frontend/src/components/ui/Button.tsx:L6-L58, frontend/src/components/ui/Input.tsx:L4-L64, frontend/src/components/ui/Checkbox.tsx:L1-L30, frontend/src/components/ui/Progress.tsx:L11-L38.
- Overlays y menus: Modal, ConfirmModal, Dropdown, ContextMenu, Tooltip, Toast. Evidencia: frontend/src/components/ui/Modal.tsx:L14-L82, frontend/src/components/ui/ConfirmModal.tsx:L20-L78, frontend/src/components/ui/Dropdown.tsx:L27-L175, frontend/src/components/ui/ContextMenu.tsx:L32-L223, frontend/src/components/ui/Tooltip.tsx:L26-L243, frontend/src/components/ui/Toast.tsx:L5-L133.
- Feedback/progreso: GlobalProgressIndicator, UploadProgress, Skeleton. Evidencia: frontend/src/components/ui/GlobalProgressIndicator.tsx:L22-L235, frontend/src/components/UploadProgress.tsx:L24-L96, frontend/src/components/ui/Skeleton.tsx:L7-L67.
- Navegacion y archivos: Sidebar, Header, Breadcrumbs, FileCard, FolderCard, FileToolbar. Evidencia: frontend/src/components/Sidebar.tsx:L423-L470, frontend/src/components/Header.tsx:L202-L399, frontend/src/components/files/Breadcrumbs.tsx:L19-L83, frontend/src/components/files/FileCard.tsx:L212-L368, frontend/src/components/files/FolderCard.tsx:L224-L341, frontend/src/components/files/FileToolbar.tsx:L1-L44.
- Viewers: ImageGallery, VideoPreview, DocumentViewer, MediaViewer. Evidencia: frontend/src/components/gallery/ImageGallery.tsx:L95-L200, frontend/src/components/gallery/VideoPreview.tsx:L42-L167, frontend/src/components/gallery/DocumentViewer.tsx:L84-L194, frontend/src/components/gallery/MediaViewer.tsx:L52-L194.
- Media playback: MusicPlayer flotante. Evidencia: frontend/src/components/MusicPlayer.tsx:L149-L169.

## Flujos UX auditados (uno por uno con hallazgos)
- Login/registro/recuperacion: validaciones y errores inline, lockout con contador, tooltip en remember me, password strength, recovery y verify con estados success/error. Evidencia: frontend/src/pages/auth/Login.tsx:L56-L358 (validacion/errores/lockout/tooltip), frontend/src/pages/auth/Register.tsx:L95-L171 (registro + password strength), frontend/src/components/ui/PasswordStrength.tsx:L16-L99 (reglas), frontend/src/pages/auth/ForgotPassword.tsx:L38-L120 (recovery), frontend/src/pages/auth/ResetPassword.tsx:L43-L143 (reset), frontend/src/pages/auth/VerifyEmail.tsx:L28-L83 (verify estados).
- Navegacion por carpetas/breadcrumb/historial: carpeta actual via query param, breadcrumbs droppable para mover, atajo Backspace para volver. Evidencia: frontend/src/pages/Files.tsx:L28-L31 (folder param), frontend/src/components/files/Breadcrumbs.tsx:L19-L83 (droppable), frontend/src/hooks/useKeyboardShortcuts.ts:L146-L151 (back).
- Subida de archivos: dropzone drag&drop, validacion previa, concurrencia por max files, cancelacion, progreso agregado y por archivo, overlay global al arrastrar. Evidencia: frontend/src/components/modals/UploadModal.tsx:L75-L199 (validacion/concurrencia/cancel), frontend/src/components/modals/UploadModal.tsx:L270-L353 (dropzone/progreso), frontend/src/components/UploadProgress.tsx:L24-L96 (panel), frontend/src/layouts/MainLayout.tsx:L1358-L1364 (overlay).
- Acciones sobre archivos: menu contextual con share/rename/move/compress/info/delete, quick actions en hover, confirmacion de borrado y progreso global. Evidencia: frontend/src/components/files/FileCard.tsx:L212-L238 (menu), frontend/src/components/files/FileCard.tsx:L330-L368 (quick actions), frontend/src/components/files/FolderCard.tsx:L224-L245 (menu), frontend/src/pages/Files.tsx:L446-L468 (confirm delete), frontend/src/components/ui/GlobalProgressIndicator.tsx:L44-L116 (operaciones).
- Vista de archivos: ImageGallery con slideshow/zoom/rotate/teclado, VideoPreview con controles y fullscreen, DocumentViewer con PDF/text/office y busqueda/zoom, MediaViewer con detalles y filmstrip. Evidencia: frontend/src/components/gallery/ImageGallery.tsx:L104-L200, frontend/src/components/gallery/VideoPreview.tsx:L42-L167, frontend/src/components/gallery/DocumentViewer.tsx:L84-L194, frontend/src/components/gallery/MediaViewer.tsx:L52-L194.
- Busqueda y filtros: search debounced en header con query param, filtros por tab en Documents/Photos, sort y view toggle en layout. Evidencia: frontend/src/components/Header.tsx:L74-L119 (search), frontend/src/pages/Documents.tsx:L100-L131 (tab filter), frontend/src/pages/Documents.tsx:L171-L181 (search param), frontend/src/pages/Photos.tsx:L34-L38 (tab), frontend/src/layouts/MainLayout.tsx:L1239-L1315 (sort/view).
- Preferencias y ajustes: toggle claro/oscuro, selector de idioma y storage meter. Evidencia: frontend/src/pages/Settings.tsx:L376-L445 (appearance/language/storage), frontend/src/stores/themeStore.ts:L10-L26 (persist), frontend/src/App.tsx:L79-L85 (aplica dark).
- Share publico: password gate, grid/list toggle y download. Evidencia: frontend/src/pages/public/PublicShare.tsx:L105-L203 (password + header), frontend/src/pages/public/PublicShare.tsx:L206-L223 (grid).

## Estados y feedback (loading/empty/error/success)
- Loading con spinners en Files/Photos/Documents/PublicShare/VerifyEmail. Evidencia: frontend/src/pages/Files.tsx:L297-L300, frontend/src/pages/Photos.tsx:L381-L385, frontend/src/pages/Documents.tsx:L289-L293, frontend/src/pages/public/PublicShare.tsx:L97-L102, frontend/src/pages/auth/VerifyEmail.tsx:L28-L39.
- Empty states con copy e iconos dependientes de contexto (files/playlist/fotos tabs). Evidencia: frontend/src/pages/Files.tsx:L301-L307 (no files/no search), frontend/src/pages/Photos.tsx:L392-L435 (empty por tab).
- Error states: ErrorBoundary global, errores por archivo en upload, errores auth, errores en DocumentViewer. Evidencia: frontend/src/components/ErrorBoundary.tsx:L73-L133, frontend/src/components/modals/UploadModal.tsx:L332-L335, frontend/src/pages/auth/Login.tsx:L264-L304, frontend/src/components/gallery/DocumentViewer.tsx:L158-L162.
- Success states: ForgotPassword y ResetPassword muestran cards de exito; VerifyEmail muestra exito. Evidencia: frontend/src/pages/auth/ForgotPassword.tsx:L67-L86, frontend/src/pages/auth/ResetPassword.tsx:L76-L94, frontend/src/pages/auth/VerifyEmail.tsx:L44-L62.
- Feedback de progreso: UploadProgress panel, progress bar en Header, GlobalProgressIndicator y modal de descarga ZIP. Evidencia: frontend/src/components/UploadProgress.tsx:L24-L96, frontend/src/components/Header.tsx:L291-L307, frontend/src/components/ui/GlobalProgressIndicator.tsx:L169-L221, frontend/src/components/files/FolderCard.tsx:L281-L339.
- Notificaciones toast con estados success/error/warning/info. Evidencia: frontend/src/components/ui/Toast.tsx:L69-L81.

## Accesibilidad (issues y mejoras)
- Modal sin focus trap ni roles ARIA (solo Escape y backdrop). Evidencia: frontend/src/components/ui/Modal.tsx:L22-L58.
- Dropdown sin roles aria ni navegacion por teclado (solo click/escape). Evidencia: frontend/src/components/ui/Dropdown.tsx:L117-L135.
- Tabs sin roles tablist/tab y sin manejo de teclado. Evidencia: frontend/src/components/ui/Tabs.tsx:L34-L76.
- Tooltip solo por hover y sin aria-describedby para foco teclado. Evidencia: frontend/src/components/ui/Tooltip.tsx:L179-L196.
- Cards focusables pero sin key handlers (solo click/doubleclick). Evidencia: frontend/src/components/files/FileCard.tsx:L330-L343.
- Buenas practicas presentes: Input con label/aria-invalid y ContextMenu con role y teclado. Evidencia: frontend/src/components/ui/Input.tsx:L21-L64, frontend/src/components/ui/ContextMenu.tsx:L111-L176.

## Responsive y layout (breakpoints y problemas)
- Grillas responsive en archivos/documentos/fotos con breakpoints md/lg/xl. Evidencia: frontend/src/pages/Files.tsx:L309-L313, frontend/src/pages/Documents.tsx:L300-L303, frontend/src/pages/Photos.tsx:L438-L439.
- PublicShare usa grid con md y lg y header sticky. Evidencia: frontend/src/pages/public/PublicShare.tsx:L156-L208.
- Layout principal con sidebar width 48 o 0, header fijo de 56px y content flex con overflow controlado. Evidencia: frontend/src/layouts/MainLayout.tsx:L890-L909.
- Auth layout centrado con max-w-md y min-h-screen. Evidencia: frontend/src/layouts/AuthLayout.tsx:L52-L55.
- Legal layout con header fixed y nav desktop (hidden md:flex). Evidencia: frontend/src/layouts/LegalLayout.tsx:L25-L61.
- No se observa un drawer mobile dedicado; el sidebar solo colapsa por width (0/48). Evidencia: frontend/src/layouts/MainLayout.tsx:L895-L900, frontend/src/components/Sidebar.tsx:L428-L431.

## Performance percibida (hallazgos y quick wins)
- Code splitting con lazy y Suspense; fallback spinner PageLoader. Evidencia: frontend/src/App.tsx:L14-L59.
- Preload de configuracion de upload para reducir latencia inicial. Evidencia: frontend/src/App.tsx:L66-L72, frontend/src/lib/chunkedUpload.ts:L63-L70.
- Cache UI con React Query (staleTime 5 min, sin refetch on focus). Evidencia: frontend/src/main.tsx:L16-L23.
- Upload chunked paralelo con retries y limite de concurrencia; progreso calculado por chunk. Evidencia: frontend/src/lib/chunkedUpload.ts:L311-L347, frontend/src/lib/chunkedUpload.ts:L451-L466.
- Viewer de media pre-carga archivos adyacentes y auto-hide de controles; ImageGallery analiza transparencia con muestreo limitado. Evidencia: frontend/src/components/gallery/MediaViewer.tsx:L78-L123, frontend/src/components/gallery/ImageGallery.tsx:L40-L89.
- Quick win: listas se renderizan con map sin virtualizacion (riesgo con grandes librerias). Evidencia: frontend/src/pages/Files.tsx:L316-L338.
- Dependencia de cMap externo para PDF (latencia/red). Evidencia: frontend/src/components/gallery/DocumentViewer.tsx:L117-L125.

## Inconsistencias detectadas (con ejemplos y evidencia)
- Clase de animacion de toast no coincide (animate-slide-in vs animate-toast-slide-in). Evidencia: frontend/src/components/ui/Toast.tsx:L93-L99, frontend/src/index.css:L280-L294.
- Modal usa animate-modal-in pero no hay definicion en CSS. Evidencia: frontend/src/components/ui/Modal.tsx:L55-L58, frontend/src/index.css:L231-L304.
- Dos sistemas de toast activos con estilos distintos. Evidencia: frontend/src/main.tsx:L31-L39 (react-hot-toast), frontend/src/App.tsx:L143-L144 (ToastContainer).
- Acentos hardcoded fuera de tokens (LegalLayout #F44336, Settings #FF3B3B, Login bg-red-500). Evidencia: frontend/src/layouts/LegalLayout.tsx:L41-L52, frontend/src/pages/Settings.tsx:L376-L418, frontend/src/pages/auth/Login.tsx:L351-L356, frontend/tailwind.config.js:L16-L20.
- Mojibake/strings corruptos visibles en UI (lista de archivos, upload speed, errores auth, legal fallback). Evidencia: frontend/src/components/files/FileCard.tsx:L309-L312, frontend/src/components/modals/UploadModal.tsx:L319-L325, frontend/src/pages/auth/Login.tsx:L295-L299, frontend/src/layouts/LegalLayout.tsx:L68-L77.
- Localizacion inconsistente: fechas fijas en es-ES y textos sin t(). Evidencia: frontend/src/lib/utils.ts:L38-L55, frontend/src/i18n.ts:L23-L29, frontend/src/components/UploadProgress.tsx:L31-L35.

## Recomendaciones priorizadas (P0, P1, P2) con impacto/esfuerzo
- P0: Accesibilidad base (focus trap y roles ARIA en Modal/Dropdown/Tabs/Tooltip; activar Enter/Espacio en cards). Impacto: alto, esfuerzo: medio. Evidencia: frontend/src/components/ui/Modal.tsx:L22-L58, frontend/src/components/ui/Dropdown.tsx:L117-L135, frontend/src/components/ui/Tabs.tsx:L34-L76, frontend/src/components/ui/Tooltip.tsx:L179-L196, frontend/src/components/files/FileCard.tsx:L330-L343.
- P0: Corregir mojibake y textos corruptos en UI y fallbacks. Impacto: alto, esfuerzo: bajo. Evidencia: frontend/src/components/files/FileCard.tsx:L309-L312, frontend/src/components/modals/UploadModal.tsx:L319-L325, frontend/src/pages/auth/Login.tsx:L295-L299, frontend/src/layouts/LegalLayout.tsx:L68-L77.
- P1: Unificar sistema de toasts y corregir nombres de animacion (toast y modal). Impacto: medio, esfuerzo: bajo/medio. Evidencia: frontend/src/components/ui/Toast.tsx:L93-L99, frontend/src/index.css:L280-L294, frontend/src/main.tsx:L31-L39, frontend/src/App.tsx:L143-L144, frontend/src/components/ui/Modal.tsx:L55-L58.
- P1: Estandarizar acentos con tokens primary (eliminar hardcodes). Impacto: medio, esfuerzo: bajo. Evidencia: frontend/src/pages/Settings.tsx:L376-L418, frontend/src/layouts/LegalLayout.tsx:L41-L52, frontend/src/pages/auth/Login.tsx:L351-L356, frontend/tailwind.config.js:L16-L20.
- P2: Virtualizar grillas/listas grandes (Files/Docs/Photos). Impacto: medio, esfuerzo: medio. Evidencia: frontend/src/pages/Files.tsx:L316-L338, frontend/src/pages/Documents.tsx:L300-L303, frontend/src/pages/Photos.tsx:L438-L439.
- P2: Fechas y horarios basados en idioma activo. Impacto: bajo/medio, esfuerzo: bajo. Evidencia: frontend/src/lib/utils.ts:L38-L55, frontend/src/i18n.ts:L23-L29.

## Apendice: Evidencias (lista de archivos clave analizados)
- frontend/src/App.tsx. Evidencia: frontend/src/App.tsx:L1-L145 (rutas, layouts, global UI).
- frontend/src/main.tsx. Evidencia: frontend/src/main.tsx:L1-L43 (router, query, toasts).
- frontend/src/index.css. Evidencia: frontend/src/index.css:L10-L304 (base, componentes, animaciones).
- frontend/tailwind.config.js. Evidencia: frontend/tailwind.config.js:L7-L58 (tokens y animaciones).
- frontend/src/layouts/MainLayout.tsx. Evidencia: frontend/src/layouts/MainLayout.tsx:L890-L1364 (layout, toolbar, overlay).
- frontend/src/layouts/AuthLayout.tsx. Evidencia: frontend/src/layouts/AuthLayout.tsx:L30-L76 (transicion auth).
- frontend/src/layouts/LegalLayout.tsx. Evidencia: frontend/src/layouts/LegalLayout.tsx:L23-L121 (legal header/theme).
- frontend/src/components/Header.tsx. Evidencia: frontend/src/components/Header.tsx:L74-L307 (search, selection, progress).
- frontend/src/components/Sidebar.tsx. Evidencia: frontend/src/components/Sidebar.tsx:L423-L470 (nav y storage).
- frontend/src/stores/sidebarStore.ts. Evidencia: frontend/src/stores/sidebarStore.ts:L19-L31 (items nav).
- frontend/src/components/files/FileCard.tsx. Evidencia: frontend/src/components/files/FileCard.tsx:L212-L368 (acciones y UI).
- frontend/src/components/files/FolderCard.tsx. Evidencia: frontend/src/components/files/FolderCard.tsx:L224-L341 (acciones y progreso).
- frontend/src/components/modals/UploadModal.tsx. Evidencia: frontend/src/components/modals/UploadModal.tsx:L75-L353 (upload UX).
- frontend/src/lib/chunkedUpload.ts. Evidencia: frontend/src/lib/chunkedUpload.ts:L14-L648 (chunked upload).
- frontend/src/components/gallery/ImageGallery.tsx. Evidencia: frontend/src/components/gallery/ImageGallery.tsx:L95-L200 (viewer imagen).
- frontend/src/components/gallery/VideoPreview.tsx. Evidencia: frontend/src/components/gallery/VideoPreview.tsx:L42-L167 (viewer video).
- frontend/src/components/gallery/DocumentViewer.tsx. Evidencia: frontend/src/components/gallery/DocumentViewer.tsx:L84-L194 (viewer documento).
- frontend/src/pages/Files.tsx. Evidencia: frontend/src/pages/Files.tsx:L26-L468 (listado/empty/confirm).
- frontend/src/pages/Photos.tsx. Evidencia: frontend/src/pages/Photos.tsx:L34-L439 (tabs/empty/grid).
- frontend/src/pages/Documents.tsx. Evidencia: frontend/src/pages/Documents.tsx:L100-L303 (tabs/search/grid).
- frontend/src/pages/auth/Login.tsx. Evidencia: frontend/src/pages/auth/Login.tsx:L56-L358 (login UX).
- frontend/src/pages/Settings.tsx. Evidencia: frontend/src/pages/Settings.tsx:L376-L445 (appearance/language/storage).
