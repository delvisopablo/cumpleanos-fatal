# cumpleanos-fatal

Una mesa de cumpleaños 3D para Hungryman, Dientes, Carlos y Daviles. La
portada está construida con Three.js y sigue siendo un sitio completamente
estático, sin backend ni paso de compilación.

## Cómo funciona

1. Cada cumpleañero está sentado en su silla, representado por un monigote
   low-poly propio y mirando hacia su porción. Otros 16 invitados recorren el
   perímetro sin cruzar la mesa y dicen una frase al tocarlos.
2. Puedes arrastrar el fondo con ratón o con el dedo para mirar alrededor.
3. La ruleta arranca muy rápido y frena progresivamente. Elige al azar una vela
   pendiente, alinea esa porción con su persona y lleva la cámara suavemente a
   un plano elevado sobre su hombro izquierdo. Desde ahí se ve toda la tarta y
   se puede seguir orbitando libremente.
4. La persona elegida mantiene pulsado el botón para abrir el micrófono y sopla
   de verdad. Al soltar se cierra. Si no hay micrófono, mantener pulsado cerca
   de un segundo activa el modo alternativo. La vela activa depende del turno,
   no de la orientación actual de la cámara.
5. Al apagarse la vela suena su canción y, si existe su archivo de letra, aparece
   una cortinilla continua calculada según la duración real del audio. Las fotos
   configuradas aparecen junto a ella. Hasta que termine no se puede girar ni
   soplar otra vela.
6. Cuando las cuatro velas están apagadas, cada porción se come en cuatro
   mordiscos. Cada mordisco reproduce `assets/sfx/comer.mp3` y su animación dura
   exactamente lo mismo que el audio; si falta, usa un fallback de un segundo.
7. Al terminar una porción se abre el cómic de esa persona. Tras ver los cuatro
   individuales aparece el botón **Cómic final**, que abre la historia conjunta.
   Si todavía no hay imágenes, se mantiene el aviso de “cómic en camino”.

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
  audio: "assets/audio/carlos.mp3",
  lyrics: "assets/lyrics/carlos.txt",
  songPhotos: [],
  comics: []
}
```

- Canciones: `assets/audio/<id>.mp3`
- Letras: `assets/lyrics/<id>.txt` (primera línea = título; resto = letra)
- Fotos de canción: `assets/song-photos/<id>/*.{jpg,png,webp}`
- Cómics: `assets/comics/<id>/*.jpg`
- Cómic grupal: `assets/comics/group/*.jpg`
- Sonido de comer: `assets/sfx/comer.mp3`

Incluye las rutas de fotos en `songPhotos` y las de cómic en `comics`, siempre
en el orden en que deben aparecer. Las rutas y los avisos amistosos se comparten
entre la escena 3D y las páginas individuales.

El cómic final se configura aparte, en la raíz de `CONFIG`:

```js
groupComic: {
  comics: ["assets/comics/group/1.jpg"]
}
```

Los 16 invitados se configuran en `assets/npcs/phrases.json`, con ids de
`npc-01` a `npc-16`, nombre y una lista de frases por personaje.

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
js/config.js           personas, colores, canciones y cómics individuales/grupal
js/cake3d.js           sala, cámara, monigotes, invitados, mesa y tarta
js/script.js           ruleta, micrófono, cortinilla, mordiscos y desbloqueos
js/persona.js          contenido de las páginas individuales
personas/              una página por cumpleañero
assets/audio/          canciones
assets/comics/         páginas de los cómics
assets/lyrics/         letras opcionales de cortinilla
assets/song-photos/    fotos opcionales durante cada canción
assets/npcs/           nombres y frases de los 16 invitados
assets/sfx/            efecto de sonido del mordisco
tests/browser-flow.mjs prueba funcional con un navegador Chromium real
```
