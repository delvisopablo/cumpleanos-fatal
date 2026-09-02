# cumpleanos-fatal

Un cumpleaños a 4 para los nuestros: Diego Sánchez, Diego Sánchez, Carlos Conde y Daviles.

Web interactiva con una tarta de 4 porciones y 4 velas, una por persona:

1. Al soplar (tocar) la vela de alguien, se apaga con humo y suena su canción.
2. Al comerse su trozo de tarta (que se desbloquea al soplar la vela), aparece
   su cómic en una ventana emergente.

## Cómo verla

Basta con abrir `index.html` en el navegador, o servir la carpeta con
cualquier servidor estático (por ejemplo `python3 -m http.server`) y
publicarla donde quieras (GitHub Pages, Netlify, etc.).

## Cómo añadir las canciones y los cómics

Todavía faltan los archivos reales, así que la web muestra avisos
amistosos ("sube aquí la canción/el cómic") hasta que los subas:

- Canciones: `assets/audio/README.md`
- Cómics: `assets/comics/README.md`

Los nombres, colores y rutas de cada persona se editan en `js/config.js`.

## Estructura

```
index.html          página principal
css/style.css        estilos y animaciones
js/config.js          nombres, colores, canción y cómic de cada persona
js/script.js          lógica de la tarta, las velas y el cómic
assets/audio/         canciones (.mp3)
assets/comics/        páginas de cómic (imágenes), una carpeta por persona
```
