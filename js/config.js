/*
  CONFIGURACIÓN DEL CUMPLE
  ========================
  Aquí es donde editas los nombres, colores, canciones, letras, fotos y
  cómics de cada persona y el cómic final del grupo. No hace falta tocar el
  resto del código.

  Para cada persona:
    id     -> identificador corto, sin espacios ni acentos (se usa para
              nombrar los archivos). No lo cambies una vez hayas subido
              archivos, o tendrás que renombrarlos también.
    name   -> nombre que se muestra en la web.
    color  -> color de su porción de tarta y de su vela (código hex).
    audio  -> ruta al archivo de la canción. Súbelo a assets/audio/
              con ese mismo nombre de archivo.
    lyrics -> ruta al archivo de letra. La primera línea es el título;
              el resto se desplaza como una cortinilla.
    songPhotos -> fotos que aparecen durante la canción, en orden.
    comics -> lista de imágenes del cómic, en orden. Puede tener 1 o
              varias páginas. Súbelas a assets/comics/<id>/ con esos
              nombres. Si la lista está vacía, se mostrará un aviso de
              "cómic en camino" hasta que añadas las imágenes aquí.

  groupComic.comics -> páginas de la historia conjunta. Súbelas a
              assets/comics/group/ y añade sus rutas en orden.

  CÓMO AÑADIR LA CANCIÓN DE ALGUIEN:
    1. Sube el mp3 a assets/audio/ (por ejemplo assets/audio/carlos.mp3).
    2. Comprueba que el campo "audio" de esa persona apunta a esa ruta.

  CÓMO AÑADIR EL CÓMIC DE ALGUIEN:
    1. Sube las imágenes a assets/comics/<id>/ (por ejemplo
       assets/comics/carlos/1.jpg, assets/comics/carlos/2.jpg...).
    2. Añade esas rutas, en orden, a la lista "comics" de esa persona.

  CÓMO AÑADIR LA LETRA DE LA CORTINILLA:
    1. Crea assets/lyrics/<id>.txt (por ejemplo assets/lyrics/carlos.txt).
    2. Escribe el título en la primera línea y la letra a partir de la segunda.
*/

const CONFIG = {
  people: [
    {
      id: "hungryman",
      name: "Hungryman",
      color: "#ff5d8f",
      audio: "assets/audio/hungryman.mp3",
      lyrics: "assets/lyrics/hungryman.txt",
      songPhotos: [],
      comics: []
    },
    {
      id: "dientes",
      name: "Dientes",
      color: "#4fb6ff",
      audio: "assets/audio/dientes.mp3",
      lyrics: "assets/lyrics/dientes.txt",
      songPhotos: [],
      comics: []
    },
    {
      id: "carlos",
      name: "Carlos Conde",
      color: "#6fe0a0",
      audio: "assets/audio/carlos.mp3",
      lyrics: "assets/lyrics/carlos.txt",
      songPhotos: [],
      comics: []
    },
    {
      id: "daviles",
      name: "Daviles",
      color: "#ffcf56",
      audio: "assets/audio/daviles.mp3",
      lyrics: "assets/lyrics/daviles.txt",
      songPhotos: [],
      comics: []
    }
  ],
  groupComic: {
    comics: []
  }
};

// Se expone explícitamente en window para que cake3d.js, script.js y las
// páginas individuales compartan exactamente la misma configuración.
window.CONFIG = CONFIG;
