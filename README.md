# cumpleanos-fatal

Una mesa de cumpleaños 3D para Geido Senchaz, Diego Sánchez, Carlos Conde y
Daviles. La portada está construida con Three.js y sigue siendo un sitio
completamente estático, sin backend ni paso de compilación.

## Cómo funciona

1. Puedes arrastrar el fondo con ratón o con el dedo para mirar alrededor de la
   sala mientras los invitados low-poly recorren el perímetro sin cruzar la mesa.
2. La ruleta gira lentamente, hace un acercamiento moderado, elige una vela
   pendiente y devuelve la cámara a la vista general exterior.
3. La persona elegida mantiene pulsado el botón para abrir el micrófono y sopla
   de verdad. Al soltar se cierra. Si no hay micrófono, mantener pulsado cerca
   de un segundo activa el modo alternativo.
4. Al apagarse la vela suena su canción y, si existe su archivo de letra, aparece
   una cortinilla continua calculada según la duración real del audio. Las fotos
   configuradas aparecen junto a ella. Hasta que termine no se puede girar ni
   soplar otra vela.
5. Cuando las cuatro velas están apagadas, cada porción se come en cuatro
   mordiscos. Cada mordisco tiene un sonido sintetizado y elimina un triángulo
   de tarta.
6. Al terminar una porción se abre el cómic de esa persona. Si todavía no hay
   imágenes, se mantiene el aviso de “cómic en camino”.

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

## Configuración de las personas

Todo se edita en `js/config.js`. Cada persona conserva exactamente estos
campos:

```js
{
  id: "carlos",
  name: "Carlos Conde",
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

Incluye las rutas de fotos en `songPhotos` y las de cómic en `comics`, siempre
en el orden en que deben aparecer. Las rutas y los avisos amistosos se comparten
entre la escena 3D y las páginas individuales.

Los 16 invitados se configuran en `assets/npcs/phrases.json`, con ids de
`npc-01` a `npc-16`, nombre y una lista de frases por personaje.

## Prueba automática en navegador

La prueba recorre las cuatro rondas, comprueba cámara, soplido mantenido,
cortinilla, NPCs y bloqueos, ejecuta los 16 mordiscos, abre los cuatro cómics y
repite la carga con tamaño móvil. Con Chrome abierto en modo headless y
depuración en el puerto `9223`, se ejecuta así:

```bash
node tests/browser-flow.mjs
```

Se puede cambiar la dirección con `SITE_URL` y el puerto con `CDP_PORT`.

## Estructura

```text
index.html             portada y controles
css/style.css          escena, interfaz fija y modal
css/persona.css        páginas individuales
js/config.js           personas, colores, canción, letra, fotos y cómic
js/cake3d.js           sala, cámara, invitados, mesa, tarta y animaciones
js/script.js           ruleta, micrófono, cortinilla, mordiscos y estados
js/persona.js          contenido de las páginas individuales
personas/              una página por cumpleañero
assets/audio/          canciones
assets/comics/         páginas de los cómics
assets/lyrics/         letras opcionales de cortinilla
assets/song-photos/    fotos opcionales durante cada canción
assets/npcs/           nombres y frases de los 16 invitados
tests/browser-flow.mjs prueba funcional con un navegador Chromium real
```
