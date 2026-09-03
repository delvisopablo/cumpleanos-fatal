# Cómics

Cada persona tiene su propia carpeta:

- `geido/`
- `diego-s2/`
- `carlos/`
- `daviles/`

Sube ahí las páginas del cómic (por ejemplo `1.jpg`, `2.jpg`, `3.jpg`...)
y después añade esas rutas, en orden, a la lista `comics` de esa persona
en `js/config.js`. Por ejemplo:

```js
comics: [
  "assets/comics/carlos/1.jpg",
  "assets/comics/carlos/2.jpg"
]
```

Puede ser una sola imagen o varias páginas: la web añadirá flechas para
pasar página automáticamente si hay más de una. Mientras la lista esté
vacía se mostrará un aviso de "cómic en camino" al comerse ese trozo de
tarta.
