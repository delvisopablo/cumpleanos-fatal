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
    audio  -> ruta al archivo de la canción. Puede ser .mp3 o .ogg; súbelo
              a assets/audio/ con ese mismo nombre de archivo. Se ignora si
              la persona tiene "video" (ver abajo).
    video  -> opcional: string con la ruta a un vídeo (por ejemplo
              assets/video/<id>.mp4) o null. Si tiene vídeo, al soplar su
              vela se reproduce ESE vídeo con su propio sonido a pantalla
              visible en vez de la canción con letra y fotos. audio, lyrics
              y songPhotos se ignoran para esa persona.
    lyrics -> ruta al archivo de letra. La primera línea es el título;
              el resto se desplaza como una cortinilla. Se ignora si tiene
              "video".
    songPhotos -> fotos que aparecen durante la canción, en orden. Se
              ignoran si tiene "video".
    comicPdf -> ruta a un único PDF con las páginas de su cómic (por
              ejemplo assets/comics/<id>/comic.pdf), o null si todavía no
              lo has subido. Se muestra con flechas de página y lupa de
              zoom. Si es null o el archivo no existe, se ve el aviso de
              "cómic en camino".

  groupComic.pdf -> igual que comicPdf pero para el cómic grupal de los
              cuatro. Súbelo a assets/comics/group/comic.pdf. Se desbloquea
              cuando ya se han visto los cuatro cómics individuales.

  ambientMusic -> ruta a una música de fondo que suena en bucle y a volumen
              bajo mientras nadie sopla su vela (al cargar la web, durante
              la ruleta, mientras se come la tarta). Se silencia en cuanto
              empieza a sonar la canción o el vídeo de alguien y vuelve a
              subir cuando termina. Si el archivo no existe todavía, la web
              sigue funcionando igual, simplemente sin música de fondo.

  CÓMO AÑADIR LA CANCIÓN DE ALGUIEN:
    1. Sube el mp3 o el ogg a assets/audio/ (por ejemplo assets/audio/carlos.ogg).
    2. Comprueba que el campo "audio" de esa persona apunta a esa ruta.

  CÓMO AÑADIR UN VÍDEO EN VEZ DE CANCIÓN:
    1. Sube el mp4 a assets/video/ (por ejemplo assets/video/dientes.mp4).
    2. Pon esa ruta en el campo "video" de esa persona.

  CÓMO AÑADIR EL CÓMIC DE ALGUIEN:
    1. Sube el PDF de 10 páginas a assets/comics/<id>/comic.pdf.
    2. Comprueba que el campo "comicPdf" de esa persona apunta a esa ruta.

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
      audio: "assets/audio/hungryman.ogg",
      video: null,
      lyrics: "assets/lyrics/hungryman.txt",
      songPhotos: [],
      comicPdf: "assets/comics/hungryman/comic.pdf"
    },
    {
      id: "dientes",
      name: "Dientes",
      color: "#4fb6ff",
      audio: null,
      video: "assets/video/dientes.mp4",
      lyrics: "assets/lyrics/dientes.txt",
      songPhotos: [],
      comicPdf: "assets/comics/dientes/comic.pdf"
    },
    {
      id: "carlos",
      name: "Carlos",
      color: "#6fe0a0",
      audio: "assets/audio/carlos.ogg",
      video: null,
      lyrics: "assets/lyrics/carlos.txt",
      songPhotos: [],
      comicPdf: "assets/comics/carlos/comic.pdf"
    },
    {
      id: "daviles",
      name: "Daviles",
      color: "#ffcf56",
      audio: "assets/audio/daviles.ogg",
      video: null,
      lyrics: "assets/lyrics/daviles.txt",
      songPhotos: [],
      comicPdf: "assets/comics/daviles/comic.pdf"
    }
  ],
  groupComic: {
    pdf: "assets/comics/group/comic.pdf"
  },
  ambientMusic: "assets/audio/musica-ambiente.mp3"
};

// Se expone explícitamente en window para que cake3d.js, script.js y las
// páginas individuales compartan exactamente la misma configuración.
window.CONFIG = CONFIG;
