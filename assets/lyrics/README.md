# Letras de la cortinilla

Añade un archivo de texto por persona con la ruta `assets/lyrics/<id>.txt` y
apunta a él desde el campo `lyrics` de `js/config.js`.

- Primera línea: título de la canción.
- Resto de líneas: letra que se desplazará de forma continua.

La cortinilla adapta su velocidad a la duración real del audio. Si el archivo
no existe, la canción continúa sin mostrar texto ni errores.
