/*
  CONFIGURACIÓN DEL CUMPLE
  ========================
  Aquí es donde editas los nombres, colores, canciones y cómics de cada
  persona. No hace falta tocar el resto del código.

  Para cada persona:
    id     -> identificador corto, sin espacios ni acentos (se usa para
              nombrar los archivos). No lo cambies una vez hayas subido
              archivos, o tendrás que renombrarlos también.
    name   -> nombre que se muestra en la web.
    displayName -> nombre visible cuando hay que distinguir a dos personas
                   que se llaman igual.
    color  -> color de su porción de tarta y de su vela (código hex).
    page   -> ruta a su página individual.
    audio  -> ruta al archivo de la canción. Súbelo a assets/audio/
              con ese mismo nombre de archivo.
    comics -> lista de imágenes del cómic, en orden. Puede tener 1 o
              varias páginas. Súbelas a assets/comics/<id>/ con esos
              nombres. Si la lista está vacía, se mostrará un aviso de
              "cómic en camino" hasta que añadas las imágenes aquí.

  CÓMO AÑADIR LA CANCIÓN DE ALGUIEN:
    1. Sube el mp3 a assets/audio/ (por ejemplo assets/audio/carlos.mp3).
    2. Comprueba que el campo "audio" de esa persona apunta a esa ruta.

  CÓMO AÑADIR EL CÓMIC DE ALGUIEN:
    1. Sube las imágenes a assets/comics/<id>/ (por ejemplo
       assets/comics/carlos/1.jpg, assets/comics/carlos/2.jpg...).
    2. Añade esas rutas, en orden, a la lista "comics" de esa persona.
*/

const CONFIG = {
  people: [
    {
      id: "diego-s1",
      name: "Diego Sánchez",
      displayName: "Diego Sánchez (1)",
      color: "#ff5d8f",
      page: "personas/diego-sanchez-1.html",
      audio: "assets/audio/diego-s1.mp3",
      comics: []
    },
    {
      id: "diego-s2",
      name: "Diego Sánchez",
      displayName: "Diego Sánchez (2)",
      color: "#4fb6ff",
      page: "personas/diego-sanchez-2.html",
      audio: "assets/audio/diego-s2.mp3",
      comics: []
    },
    {
      id: "carlos",
      name: "Carlos Conde",
      displayName: "Carlos Conde",
      color: "#6fe0a0",
      page: "personas/carlos-conde.html",
      audio: "assets/audio/carlos.mp3",
      comics: []
    },
    {
      id: "daviles",
      name: "Daviles",
      displayName: "Daviles",
      color: "#ffcf56",
      page: "personas/daviles.html",
      audio: "assets/audio/daviles.mp3",
      comics: []
    }
  ]
};

// Se expone explícitamente en window para que los módulos ES (cake3d.js,
// script.js) puedan leerlo sin depender del scoping implícito entre
// <script> clásicos y <script type="module">.
window.CONFIG = CONFIG;
