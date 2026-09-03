# cumpleanos-fatal

Una mesa de cumpleaños 3D para Geido Senchaz, Diego Sánchez, Carlos Conde y
Daviles. La portada está construida con Three.js y sigue siendo un sitio
completamente estático, sin backend ni paso de compilación.

## Cómo funciona

1. Puedes arrastrar el fondo con ratón o con el dedo para mirar alrededor de la
   sala mientras los invitados low-poly recorren el perímetro sin cruzar la mesa.
2. La ruleta gira lentamente, elige una vela pendiente y lleva la cámara al
   punto de vista de la silla correspondiente.
3. La persona elegida puede soplar con el micrófono, mantener pulsada la barra
   espaciadora o mantener pulsado el botón táctil.
4. Al apagarse la vela suena su canción y, si existe su archivo de letra, aparece
   un karaoke repartido según la duración real del audio. Hasta que termine no
   se puede girar ni soplar otra vela.
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
que para ver el karaoke debes usar el servidor estático. No hay que instalar
dependencias ni ejecutar un build. La misma carpeta puede publicarse tal cual
en GitHub Pages, Netlify o cualquier hosting estático.

## Configuración de las personas

Todo se edita en `js/config.js`. Cada persona conserva los campos existentes y
puede indicar su bebida:

```js
{
  id: "carlos",
  name: "Carlos Conde",
  displayName: "Carlos Conde",
  color: "#6fe0a0",
  page: "personas/carlos-conde.html",
  drink: "beer", // "beer" o "wine"; si falta, se alternan
  audio: "assets/audio/carlos.mp3",
  comics: []
}
```

- Canciones: `assets/audio/<id>.mp3`
- Letras: `assets/lyrics/<id>.txt` (una línea por línea)
- Cómics: `assets/comics/<id>/*.jpg`

Para añadir un cómic, incluye sus rutas en `comics` respetando el orden de las
páginas. Las rutas y los avisos amistosos se comparten entre la escena 3D y las
páginas individuales.

## Prueba automática en navegador

La prueba recorre las cuatro rondas, comprueba los bloqueos, ejecuta los 16
mordiscos, abre los cuatro cómics y repite la carga con tamaño móvil. Con Chrome
abierto en modo headless y depuración en el puerto `9223`, se ejecuta así:

```bash
node tests/browser-flow.mjs
```

Se puede cambiar la dirección con `SITE_URL` y el puerto con `CDP_PORT`.

## Estructura

```text
index.html             portada y controles
css/style.css          escena, interfaz fija y modal
css/persona.css        páginas individuales
js/config.js           personas, colores, bebida, canción y cómic
js/cake3d.js           sala, cámara, invitados, mesa, tarta y animaciones
js/script.js           ruleta, micrófono, karaoke, mordiscos y estados
js/persona.js          contenido de las páginas individuales
personas/              una página por cumpleañero
assets/audio/          canciones
assets/comics/         páginas de los cómics
assets/lyrics/         letras opcionales de karaoke
tests/browser-flow.mjs prueba funcional con un navegador Chromium real
```
