# cumpleanos-fatal

Una mesa de cumpleaños 3D para Hungryman, Dientes, Carlos y Daviles. La
portada está construida con Three.js y sigue siendo un sitio completamente
estático, sin backend ni paso de compilación.

## Cómo funciona

1. Cada cumpleañero está sentado en su silla, representado por un monigote
   low-poly propio y mirando hacia su porción. El resto de invitados (tantos
   como haya en `assets/npcs/phrases.json`) recorren el perímetro sin cruzar
   la mesa y dicen una frase al tocarlos.
2. Puedes arrastrar el fondo con ratón o con el dedo para mirar alrededor, en
   cualquier momento — también mientras suena una canción o se reproduce un
   vídeo tras soplar una vela.
3. La ruleta arranca muy rápido y frena progresivamente. Elige al azar una vela
   pendiente, alinea esa porción con su persona y lleva la cámara suavemente a
   un plano elevado sobre su hombro izquierdo. Desde ahí se ve toda la tarta y
   se puede seguir orbitando libremente.
4. La persona elegida mantiene pulsado el botón para abrir el micrófono y sopla
   de verdad. Al soltar se cierra. Si no hay micrófono, mantener pulsado cerca
   de un segundo activa el modo alternativo. La vela activa depende del turno,
   no de la orientación actual de la cámara.
5. Al apagarse la vela ocurre una de estas dos cosas, según la persona:
   - Si tiene `video` configurado, se reproduce ese vídeo (con su propio
     sonido) a pantalla visible.
   - Si no, suena su canción y, si existe su archivo de letra, aparece una
     cortinilla continua calculada según la duración real del audio, con las
     fotos configuradas junto a ella.
   Hasta que termine la canción o el vídeo no se puede girar ni soplar otra
   vela, pero la cámara se puede seguir moviendo en todo momento.
6. Cuando las cuatro velas están apagadas, cada porción se come en cuatro
   mordiscos. Cada mordisco reproduce `assets/sfx/comer.mp3` y su animación dura
   exactamente lo mismo que el audio; si falta, usa un fallback de un segundo.
7. Al terminar una porción se abre el cómic en PDF de esa persona, con flechas
   para pasar de página en página y una lupa para ampliarla. Tras ver los
   cuatro individuales aparece el botón **Cómic final**, que abre la historia
   conjunta. Si todavía no hay PDF subido, se mantiene el aviso de “cómic en
   camino”.

Los nombres de la barra inferior enlazan a las cuatro páginas individuales.

## Cómo verla

La opción recomendada es servir la carpeta con un servidor estático:

```bash
python3 -m http.server 4173
```

Después abre `http://localhost:4173`.

También puedes abrir `index.html` directamente. Three.js se carga desde el CDN
de jsDelivr, así que la portada 3D necesita conexión a internet en ambos casos.
Los navegadores no permiten leer archivos `.txt` locales desde `file://`, así
que para ver la letra debes usar el servidor estático. No hay que instalar
dependencias ni ejecutar un build. La misma carpeta puede publicarse tal cual
en GitHub Pages, Netlify o cualquier hosting estático.

## Desplegar en Vercel

1. Importa el repo en Vercel.
2. No hace falta tocar nada: `vercel.json` ya le dice a Vercel que es un
   sitio estático (sin build ni instalación), así que lo sirve tal cual
   desde la raíz.

## Desplegar en Railway

1. Crea un servicio nuevo en Railway a partir de este repo.
2. Railway detecta `package.json` y `railway.json` solo: instala
   `serve` (`npm install`) y arranca con `npm start`, que sirve la
   carpeta entera como sitio estático en el puerto que Railway asigne
   (variable `PORT`).

Ninguna de las dos plataformas necesita variables de entorno ni base de
datos: sigue siendo un sitio 100% estático.

## Configuración de las personas

Todo se edita en `js/config.js`. Cada persona conserva exactamente estos
campos:

```js
{
  id: "carlos",
  name: "Carlos",
  color: "#6fe0a0",
  audio: "assets/audio/carlos.ogg",
  video: null,
  lyrics: "assets/lyrics/carlos.txt",
  songPhotos: [],
  comicPdf: "assets/comics/carlos/comic.pdf"
}
```

- Canciones: `assets/audio/<id>.mp3` o `assets/audio/<id>.ogg` (si el
  navegador no puede reproducir el formato, se muestra un aviso amistoso en
  vez de fallar en silencio).
- Vídeo en vez de canción: `assets/video/<id>.mp4`, puesto en el campo
  `video`. Si una persona tiene vídeo, se reproduce eso al soplar su vela en
  lugar de audio+letra+fotos (que se ignoran para ella).
- Letras: `assets/lyrics/<id>.txt` (primera línea = título; resto = letra)
- Fotos de canción: `assets/song-photos/<id>/*.{jpg,png,webp}`
- Cómics: un único PDF de varias páginas en `assets/comics/<id>/comic.pdf`,
  puesto en el campo `comicPdf`. Se muestra con flechas de página y una lupa
  para ampliar.
- Cómic grupal: `assets/comics/group/comic.pdf`
- Sonido de comer: `assets/sfx/comer.mp3`

El cómic final se configura aparte, en la raíz de `CONFIG`:

```js
groupComic: {
  pdf: "assets/comics/group/comic.pdf"
}
```

Los invitados que pasean alrededor de la mesa se configuran en
`assets/npcs/phrases.json`, con ids `npc-01`, `npc-02`… nombre y una lista de
frases por personaje. La cantidad de invitados que aparecen caminando se
ajusta automáticamente a cuántas entradas tenga ese archivo.

## Prueba automática en navegador

La prueba recorre las cuatro rondas y comprueba los cuatro monigotes, el frenado,
la alineación exacta, el plano sobre el hombro, la órbita posterior, el soplido
mantenido desde otro ángulo, la cortinilla, los NPCs y los bloqueos. También
ejecuta los 16 mordiscos, abre los cuatro cómics, desbloquea el grupal y repite
la carga con tamaño móvil. Con Chrome abierto en modo headless y depuración en
el puerto `9223`, se ejecuta así:

```bash
node tests/browser-flow.mjs
```

Se puede cambiar la dirección con `SITE_URL` y el puerto con `CDP_PORT`.

## Estructura

```text
index.html             portada y controles
css/style.css          escena, interfaz fija y modal
css/persona.css        páginas individuales
js/config.js           personas, colores, canciones/vídeos y cómics individuales/grupal
js/cake3d.js           sala, cámara, monigotes, invitados, mesa y tarta
js/script.js           ruleta, micrófono, cortinilla, vídeo, mordiscos y desbloqueos
js/comic-viewer.js     carga y dibuja páginas de cómic en PDF (PDF.js)
js/persona.js          contenido de las páginas individuales
personas/              una página por cumpleañero
assets/audio/          canciones (.mp3 o .ogg)
assets/video/          vídeos que sustituyen a la canción de alguien
assets/comics/         un comic.pdf por persona y el del grupo
assets/lyrics/         letras opcionales de cortinilla
assets/song-photos/    fotos opcionales durante cada canción
assets/npcs/           nombres y frases de los invitados que pasean
assets/sfx/            efecto de sonido del mordisco
tests/browser-flow.mjs prueba funcional con un navegador Chromium real
```
