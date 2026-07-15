# CLAUDE.md

## Historial de trabajos realizados

Resumen organizado de los 86 commits del repositorio (desde la subida inicial de archivos en abril 2026 hasta julio 2026).

### Orígenes del proyecto (abril–mayo 2026)
- El proyecto arrancó como una serie de subidas de archivos sueltas ("Add files via upload") entre el 27/04/2026 y el 15/05/2026, antes de tener una estructura formal de commits.
- `e33b1cd` (16/05/2026) es el "Initial commit" formal del repo tal como existe hoy, seguido de un merge (`7802ac9`) que conservó mejoras locales.
- Primeras features de tienda: grilla mobile de 2 columnas con orden por precio (`6597026`), buscador con lupa (dropdown, thumbnails, resaltado, navegación por teclado) (`deb9687`, `fa86424`, `911e1fd`), y fix de flash amarillo al cargar (`035b601`).
- `0a9fe71` separó el código monolítico en `index.html` + `styles.css` + `app.js`, la estructura base que se mantiene hasta hoy.

### SEO
- `72c7ad3`: Open Graph completo, structured data JSON-LD, `sitemap.xml` y `robots.txt`.
- `adcd244`: URLs reales de GitHub Pages en todos los archivos.
- `59bce77`: ajuste de textos SEO para Caracas y accesorios.
- `3c9ec64`: archivo de verificación de Google Search Console.

### PWA e íconos de la app
- `3edea41`: primer manifest.json, service worker e íconos, más meta tags Open Graph (base de la PWA).
- `249fbf0`: nuevo ícono con el logo de The Lemon Club (192px y 512px).
- `415bc1d` → `91f4b43`: iteración de los íconos — se les agregó padding para "zona segura" de Android, se separó el `purpose` del manifest en `any` vs `maskable`, y luego se redujo el padding a 4% y se subió la saturación a 1.35x para íconos "full color".
- `81e12b0`, `413f897`: fondo verde explícito y transparencia correcta en los íconos/loading screen para eliminar una caja negra que aparecía en el splash screen de la PWA.
- Mascota (personaje 🍋 de la marca) en el nav: introducida en `8d315f1` (mascota en nav izquierdo + botón "Descargar App" con prompt de instalación PWA), con varias rondas de fixes de nitidez y resolución: `1db94f6`, `bd78190`, `c3cad1c` (arreglos de overflow/hamburger en nav), `7e1c5d9` (600x600 + animación GPU), `857fd56` (800x800 nítida + bump de SW a v19 porque el SW anterior había cacheado la mascota vieja de 200x200), `b3e3c66` (emoji 🍋 del loading siempre nítido).
- Acceso admin oculto: `4f8f454` eliminó el botón de engranaje visible del nav — el acceso admin quedó escondido detrás de tocar la mascota 5 veces, reforzado por `33358f2` que además permite abrir el modal de login vía URL secreta `?admin` (el parámetro se borra de la URL al detectarse).
- Instalación de la PWA: `ef9f74c` reemplazó el `alert()` de instrucciones por un modal con instrucciones específicas por dispositivo; `6cb1c03` aseguró que el botón "Descargar App" sea visible siempre que la app no esté en modo standalone.
- Versionado del Service Worker: se fue incrementando (`sw.js` v18, v19, v20) cada vez que un cambio de assets (íconos, CSS, mascota) requería forzar la invalidación de caché — ver `857fd56` y `1fab32d`.

### Rendimiento (loading screen, imágenes, caché)
- `5993ed1`: eliminó ~582KB de base64 embebido en `app.js`, moviendo el loading screen al HTML con efecto shimmer.
- `5faae97`: la mascota volvió a ser un archivo separado (19KB) en vez de embebida (583KB).
- Iteraciones largas sobre el loading screen (mayo 2026): estructura sin `#loading-inner` (`029cd36`, `4b25586`), selectores de clases independientes del parent (`6e91b0d`), contraste de textos (`806e047`), tamaño de la mascota en el loading (`551d78b` → 160px en `219b3fe`), coherencia de color entre loading screen y nav (`0bea76f`, `df99cb2`), y finalmente ocultar la caja/fondo negro visible durante la animación GPU (`384ea6c`, `413f897`, `81e12b0`).
- `863b22c`: el loading screen se mantiene visible hasta que **todas** las imágenes terminan de cargar (evita mostrar la tienda a medias).
- `6803abc`: se introdujo IndexedDB para cachear imágenes en base64 sin el límite de tamaño de `localStorage`, eliminando un delay de ~3s en cargas repetidas.
- `a888faa`: se dejó de cachear base64 en `localStorage` para evitar errores de "quota exceeded" en productos con muchas imágenes.
- `b4f42f5`: el input oculto del formulario de producto se setea con el base64 inmediatamente después de comprimir la imagen (antes había un desfase).
- `f0772b3`: estrategia de caché del Service Worker — cache-first para SDKs/fuentes, stale-while-revalidate para imágenes.
- `31adf2b`, `c5adc25`: se espera a que las imágenes carguen antes de revelar la tienda, compresión de imágenes a 600x800 con center-crop, y productos agotados se muestran sombreados en el buscador.

### Panel admin y catálogo
- `68a4825`: fix de un bug donde el guardado en el panel admin se quedaba atascado en "Guardando…", más protección de caché de Firebase específica para PWA.
- Etiqueta "Nuevo" en productos: se agregó en algún punto y luego se eliminó por completo — del formulario y las tarjetas (`1439fb2`) y también al guardar/editar productos existentes (`3e3e4a0`), para simplificar el catálogo.
- `68fc484`: las etiquetas de stock se hicieron visibles y se reposicionaron arriba a la derecha de la tarjeta de producto.

### Firebase / Firestore y lista de espera ("avísame cuando vuelva en stock")
- `2e60631` (11/06/2026) es el commit principal de esta feature:
  - Botón verde sobre la imagen de cada producto agotado ("🔔 AVÍSENME CUANDO ESTE PRODUCTO VUELVA EN STOCK ♥"), también visible en la página de detalle del producto.
  - Modal con formulario de Nombre + WhatsApp, con validación y prevención de registros duplicados.
  - Los registros se guardan en la colección Firestore `waitlist` con `serverTimestamp()`.
  - Nueva sección "Lista de espera" en el panel admin: resumen por producto, filtros, botón de WhatsApp (`wa.me`) pre-llenado con el número de la clienta, y botón "✓ Notificada" que marca el registro en Firestore y atenúa la fila.
- `85b50bb`: se agregó la configuración formal de Firebase al repo — `firebase.json` + `.firebaserc` apuntando al proyecto `thelemonclub`, y `firestore.rules` con reglas de validación de estructura para la colección `waitlist`.
- `3b5392d`: botón para que el admin elimine un registro de la lista de espera.
- `340db5f`: el botón "✕" de eliminar se movió a las tarjetas de resumen por producto (antes estaba, incorrectamente, en cada fila individual).

### Integración de notificaciones por Telegram
- `c712652` (18/06/2026): cuando una clienta se registra en la lista de espera, `app.js` ahora dispara además un mensaje al bot de Telegram del admin vía `fetch` a la API de Telegram (`sendMessage`), incluyendo nombre, WhatsApp y producto. El mensaje original usaba `parse_mode: 'Markdown'` con asteriscos para negritas.
- `22d6850` (mismo día, poco después): fix que **simplifica el mensaje quitando el Markdown** (se eliminaron los asteriscos y el parámetro `parse_mode`), porque el formato Markdown estaba causando errores de envío en algunos casos (p. ej. caracteres especiales en el nombre rompían el parseo de Telegram).
- Nota: el token del bot y el `chat_id` están hardcodeados directamente en `app.js` (código cliente, público). Es un punto a tener en cuenta si en el futuro se quiere endurecer la seguridad (mover el envío a una Cloud Function en vez de exponer el token en el frontend).
