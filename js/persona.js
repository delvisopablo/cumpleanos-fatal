(function () {
  "use strict";

  const personId = document.body.dataset.personId;
  const assetPrefix = document.body.dataset.assetPrefix || "";
  const person = CONFIG.people.find((item) => item.id === personId);
  let currentAudio = null;

  let pdfDoc = null;
  let pageNum = 1;
  let numPages = 0;
  let zoomed = false;
  let renderSeq = 0;

  function assetUrl(path) {
    return `${assetPrefix}${path}`;
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 4200);
  }

  function buildBackground() {
    const bg = document.getElementById("party-bg");
    const hues = ["#ff5d8f", "#4fb6ff", "#6fe0a0", "#ffcf56", "#c58bff"];

    for (let i = 0; i < 8; i++) {
      const balloon = document.createElement("div");
      balloon.className = "balloon";
      balloon.style.setProperty("--left", `${Math.round(Math.random() * 92)}%`);
      balloon.style.setProperty("--size", `${44 + Math.round(Math.random() * 34)}px`);
      balloon.style.setProperty("--dur", `${14 + Math.random() * 10}s`);
      balloon.style.setProperty("--delay", `${-Math.random() * 18}s`);
      balloon.style.setProperty("--hue", hues[i % hues.length]);
      bg.appendChild(balloon);
    }

    for (let i = 0; i < 14; i++) {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.setProperty("--left", `${Math.round(Math.random() * 100)}%`);
      confetti.style.setProperty("--dur", `${7 + Math.random() * 6}s`);
      confetti.style.setProperty("--delay", `${-Math.random() * 10}s`);
      confetti.style.setProperty("--hue", hues[(i + 2) % hues.length]);
      bg.appendChild(confetti);
    }
  }

  function renderComicPlaceholder(html) {
    document.getElementById("personal-gallery").innerHTML = `<div class="personal-placeholder">${html}</div>`;
    document.getElementById("personal-comic-nav").hidden = true;
  }

  function missingComicHtml() {
    return `<span aria-hidden="true">📔✨</span>
      <strong>El cómic de ${person.displayName || person.name} está de camino.</strong>
      <p>Se mostrará aquí cuando subas el PDF a<br><code>assets/comics/${person.id}/comic.pdf</code>.</p>`;
  }

  function updateComicNav() {
    const nav = document.getElementById("personal-comic-nav");
    const counter = document.getElementById("personal-comic-counter");
    const prevBtn = document.getElementById("personal-prev-btn");
    const nextBtn = document.getElementById("personal-next-btn");
    const zoomBtn = document.getElementById("personal-zoom-btn");
    const hasPdf = Boolean(pdfDoc) && numPages > 0;

    nav.hidden = !hasPdf;
    counter.textContent = hasPdf && numPages > 1 ? `${pageNum} / ${numPages}` : "";
    prevBtn.disabled = !hasPdf || pageNum <= 1;
    nextBtn.disabled = !hasPdf || pageNum >= numPages;
    zoomBtn.hidden = !hasPdf;
    zoomBtn.setAttribute("aria-pressed", zoomed ? "true" : "false");
  }

  async function renderComicPage() {
    if (!pdfDoc) return;
    renderSeq += 1;
    const seq = renderSeq;
    const gallery = document.getElementById("personal-gallery");
    const targetWidth = Math.max(240, Math.min(680, gallery.clientWidth || 480));
    try {
      const canvas = await window.ComicViewer.renderPage(pdfDoc, pageNum, { targetWidth, zoomed });
      if (seq !== renderSeq) return;
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", `Página ${pageNum} del cómic de ${person.displayName || person.name}`);
      gallery.innerHTML = "";
      gallery.appendChild(canvas);
    } catch (error) {
      if (seq !== renderSeq) return;
      renderComicPlaceholder(missingComicHtml());
      return;
    }
    updateComicNav();
  }

  async function renderComic() {
    const url = person.comicPdf;
    if (!url || !window.ComicViewer || !window.ComicViewer.available()) {
      renderComicPlaceholder(missingComicHtml());
      return;
    }
    document.getElementById("personal-gallery").innerHTML = `<div class="personal-placeholder"><strong>Cargando cómic…</strong></div>`;
    const doc = await window.ComicViewer.loadDocument(assetUrl(url));
    if (!doc) {
      renderComicPlaceholder(missingComicHtml());
      return;
    }
    pdfDoc = doc;
    numPages = doc.numPages;
    pageNum = 1;
    zoomed = false;
    await renderComicPage();
  }

  function bindComicNav() {
    document.getElementById("personal-prev-btn").addEventListener("click", () => {
      if (pdfDoc && pageNum > 1) {
        pageNum -= 1;
        renderComicPage();
      }
    });
    document.getElementById("personal-next-btn").addEventListener("click", () => {
      if (pdfDoc && pageNum < numPages) {
        pageNum += 1;
        renderComicPage();
      }
    });
    document.getElementById("personal-zoom-btn").addEventListener("click", () => {
      if (!pdfDoc) return;
      zoomed = !zoomed;
      document.getElementById("personal-gallery").classList.toggle("is-zoomed", zoomed);
      renderComicPage();
    });
  }

  function guessAudioMime(path) {
    const ext = String(path || "").split(".").pop().toLowerCase();
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "ogg") return "audio/ogg";
    if (ext === "wav") return "audio/wav";
    if (ext === "m4a" || ext === "aac") return "audio/mp4";
    return "";
  }

  function playSong() {
    if (currentAudio) currentAudio.pause();
    const mime = guessAudioMime(person.audio);
    const audio = new Audio();
    if (mime && typeof audio.canPlayType === "function" && !audio.canPlayType(mime)) {
      showToast(`🎵 Tu navegador no puede reproducir esta canción (formato no compatible).`);
      return;
    }
    currentAudio = audio;
    audio.src = assetUrl(person.audio);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        showToast(`🎵 La canción de ${person.displayName || person.name} estará disponible muy pronto.`);
      });
    }
  }

  function playVideo() {
    const video = document.getElementById("personal-video");
    if (typeof video.canPlayType === "function" && !video.canPlayType("video/mp4")) {
      showToast("🎬 Tu navegador no puede reproducir este vídeo.");
      return;
    }
    video.classList.remove("hidden");
    video.src = assetUrl(person.video);
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        showToast(`🎬 El vídeo de ${person.displayName || person.name} estará disponible muy pronto.`);
        video.classList.add("hidden");
      });
    }
  }

  function init() {
    if (!person) {
      window.location.replace("../index.html");
      return;
    }

    const displayName = person.displayName || person.name;
    document.documentElement.style.setProperty("--person-color", person.color);
    document.getElementById("person-name").textContent = displayName;
    document.getElementById("dedication-name").textContent = displayName;
    document.getElementById("comic-name").textContent = displayName;

    const playButton = document.getElementById("play-song");
    if (person.video) {
      playButton.textContent = "▶ Ver tu vídeo";
      playButton.addEventListener("click", playVideo);
    } else {
      playButton.addEventListener("click", playSong);
    }

    buildBackground();
    bindComicNav();
    renderComic();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
