(function () {
  "use strict";

  const personId = document.body.dataset.personId;
  const assetPrefix = document.body.dataset.assetPrefix || "";
  const person = CONFIG.people.find((item) => item.id === personId);
  let currentAudio = null;

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

  function renderComic() {
    const gallery = document.getElementById("personal-gallery");
    const comics = person.comics || [];

    if (comics.length === 0) {
      gallery.innerHTML = `
        <div class="personal-placeholder">
          <span aria-hidden="true">📔✨</span>
          <strong>El cómic de ${person.displayName || person.name} está de camino.</strong>
          <p>Cuando estén listas sus páginas, aparecerán aquí.</p>
        </div>`;
      return;
    }

    comics.forEach((comic, index) => {
      const image = document.createElement("img");
      image.src = assetUrl(comic);
      image.alt = `Página ${index + 1} del cómic de ${person.displayName || person.name}`;
      image.loading = "lazy";
      image.onerror = () => {
        image.remove();
        showToast(`No se encuentra la imagen ${comic}.`);
      };
      gallery.appendChild(image);
    });
  }

  function playSong() {
    if (currentAudio) currentAudio.pause();
    currentAudio = new Audio(assetUrl(person.audio));
    const playPromise = currentAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        showToast(`🎵 La canción de ${person.displayName || person.name} estará disponible muy pronto.`);
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
    document.getElementById("play-song").addEventListener("click", playSong);
    buildBackground();
    renderComic();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
