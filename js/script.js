// Orquestación de la página: estado de velas/porciones, ruleta, soplido
// (micrófono / espacio / botón táctil), mordisco y modal de cómic.
// La parte 3D vive en js/cake3d.js; aquí solo se decide "cuándo" pasa cada cosa.

(function () {
  "use strict";

  const CONFIG = window.CONFIG;
  const BLOW_SUSTAIN_MS = 260; // cuánto tiempo hay que mantener el soplido/espacio/tap
  const BLOW_RMS_THRESHOLD = 0.17; // umbral de volumen (0-1) para considerar "soplido"

  const state = {}; // { id: { blown, eaten } }
  let currentAudio = null;
  let modalPerson = null;
  let modalIndex = 0;

  let cake = null;
  let activeCandleId = null;
  let spinning = false;
  let allBlown = false;

  // ---------- utilidades compartidas con la config ----------

  function displayNames(people) {
    if (people.every((p) => p.displayName)) {
      return people.map((p) => p.displayName);
    }
    const counts = {};
    people.forEach((p) => { counts[p.name] = (counts[p.name] || 0) + 1; });
    const seen = {};
    return people.map((p) => {
      if (counts[p.name] > 1) {
        seen[p.name] = (seen[p.name] || 0) + 1;
        return `${p.name} (${seen[p.name]})`;
      }
      return p.name;
    });
  }

  function personById(id) {
    return CONFIG.people.find((p) => p.id === id);
  }

  // ---------- fondo de fiesta (globos/confeti), igual que antes ----------

  function buildBackground() {
    const bg = document.getElementById("party-bg");
    const hues = ["#ff5d8f", "#4fb6ff", "#6fe0a0", "#ffcf56", "#c58bff"];
    for (let i = 0; i < 9; i++) {
      const b = document.createElement("div");
      b.className = "balloon";
      b.style.setProperty("--left", `${Math.round(Math.random() * 92)}%`);
      b.style.setProperty("--size", `${44 + Math.round(Math.random() * 34)}px`);
      b.style.setProperty("--dur", `${14 + Math.random() * 10}s`);
      b.style.setProperty("--delay", `${-Math.random() * 18}s`);
      b.style.setProperty("--hue", hues[i % hues.length]);
      bg.appendChild(b);
    }
    for (let i = 0; i < 16; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.setProperty("--left", `${Math.round(Math.random() * 100)}%`);
      c.style.setProperty("--dur", `${7 + Math.random() * 6}s`);
      c.style.setProperty("--delay", `${-Math.random() * 10}s`);
      c.style.setProperty("--hue", hues[(i + 2) % hues.length]);
      bg.appendChild(c);
    }
  }

  // ---------- leyenda ----------

  function renderLegend(names) {
    const ul = document.getElementById("legend");
    ul.innerHTML = "";
    CONFIG.people.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "legend-item";
      li.id = `legend-${p.id}`;

      const link = document.createElement("a");
      link.className = "person-link";
      link.href = p.page;
      link.setAttribute("aria-label", `Abrir la página de ${names[i]}`);

      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = p.color;

      const name = document.createElement("span");
      name.className = "legend-name";
      name.textContent = names[i];

      const status = document.createElement("span");
      status.className = "legend-status";
      status.textContent = "🕯️";
      status.setAttribute("aria-hidden", "true");

      link.append(dot, name, status);
      li.appendChild(link);
      ul.appendChild(li);
    });
  }

  function updateLegend(id) {
    const s = state[id];
    const li = document.getElementById(`legend-${id}`);
    if (!li) return;
    const status = li.querySelector(".legend-status");
    status.textContent = s.eaten ? "😋" : s.blown ? "🍰" : "🕯️";
  }

  // ---------- audio: canción de cada persona ----------

  function playSong(id) {
    const person = personById(id);
    if (!currentAudio) {
      currentAudio = new Audio();
    }
    currentAudio.pause();
    currentAudio.src = person.audio;
    const playPromise = currentAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        showToast(`🎵 Añade la canción de ${person.name} en "${person.audio}" para que suene aquí.`);
      });
    }
  }

  // ---------- sonido sintetizado "ñam ñam" (sin depender de un mp3) ----------

  let sfxCtx = null;
  function getSfxCtx() {
    if (!sfxCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      sfxCtx = new Ctx();
    }
    return sfxCtx;
  }

  function playNomSound() {
    try {
      const ctx = getSfxCtx();
      const now = ctx.currentTime;
      [0, 0.16].forEach((offset) => {
        const bufferSize = Math.floor(ctx.sampleRate * 0.12);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1200, now + offset);
        filter.frequency.exponentialRampToValueAtTime(280, now + offset + 0.12);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.5, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);
        noise.connect(filter).connect(gain).connect(ctx.destination);
        noise.start(now + offset);
        noise.stop(now + offset + 0.13);
      });
    } catch (err) {
      // Sin Web Audio disponible: seguimos sin sonido, no rompemos el mordisco.
    }
  }

  // ---------- toast ----------

  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 4200);
  }

  function setStatus(msg) {
    document.getElementById("cake-status").textContent = msg;
  }

  // ---------- micrófono: detección real de soplido ----------

  let micRequested = false;
  let micEnabled = false;
  let audioCtx = null;
  let analyser = null;
  let micDataArray = null;
  let breathAboveSince = null;

  async function ensureMic() {
    if (micRequested) return micEnabled;
    micRequested = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast("Tu navegador no soporta el micrófono aquí: sopla con la barra espaciadora o el botón 🎤.");
      return false;
    }

    showToast("Pedimos permiso al micrófono solo para detectar tu soplido 🌬️ — no se graba ni se guarda nada.");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      micDataArray = new Uint8Array(analyser.frequencyBinCount);
      micEnabled = true;
      requestAnimationFrame(micLoop);
      return true;
    } catch (err) {
      showToast("Sin permiso de micrófono: puedes soplar igualmente con la barra espaciadora o el botón 🎤.");
      micEnabled = false;
      return false;
    }
  }

  function micLoop() {
    if (micEnabled && analyser) {
      analyser.getByteTimeDomainData(micDataArray);
      let sum = 0;
      for (let i = 0; i < micDataArray.length; i++) {
        const v = (micDataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / micDataArray.length);

      if (activeCandleId && !state[activeCandleId].blown) {
        if (rms > BLOW_RMS_THRESHOLD) {
          if (breathAboveSince === null) breathAboveSince = performance.now();
          else if (performance.now() - breathAboveSince > BLOW_SUSTAIN_MS) {
            breathAboveSince = null;
            handleBlowSignal();
          }
        } else {
          breathAboveSince = null;
        }
      }
    }
    requestAnimationFrame(micLoop);
  }

  // ---------- espacio / botón táctil: soplido alternativo ----------

  let chargeTimer = null;

  function startCharge() {
    if (!activeCandleId || state[activeCandleId].blown || spinning) return;
    if (chargeTimer) return;
    chargeTimer = setTimeout(() => {
      chargeTimer = null;
      handleBlowSignal();
    }, BLOW_SUSTAIN_MS);
  }

  function cancelCharge() {
    if (chargeTimer) {
      clearTimeout(chargeTimer);
      chargeTimer = null;
    }
  }

  function handleBlowSignal() {
    if (!activeCandleId || state[activeCandleId].blown) return;
    blowOutCandle(activeCandleId);
  }

  // ---------- velas ----------

  function blowOutCandle(id) {
    const s = state[id];
    if (!s || s.blown) return;
    s.blown = true;
    breathAboveSince = null;
    cancelCharge();

    const wasActive = activeCandleId === id;
    if (wasActive) activeCandleId = null;

    cake.blowOutCandle(id);
    updateLegend(id);
    playSong(id);

    const person = personById(id);
    const remaining = CONFIG.people.filter((p) => !state[p.id].blown);

    if (remaining.length === 0) {
      allBlown = true;
      enterBitePhase();
    } else {
      setStatus(`¡Vela de ${person.name} apagada! 🎶 Gira otra vez para la próxima vela.`);
      setBlowUiVisible(false);
      document.getElementById("spin-btn").disabled = false;
    }
  }

  function setBlowUiVisible(visible) {
    document.getElementById("blow-btn").hidden = !visible;
    document.getElementById("cake-hint").hidden = !visible;
  }

  function armCandle(id) {
    activeCandleId = id;
    const person = personById(id);
    setStatus(`¡Le toca a ${person.name}! Sopla su vela para apagarla.`);
    setBlowUiVisible(true);
    document.getElementById("spin-btn").disabled = true;
    ensureMic();
  }

  async function onSpinClick() {
    if (spinning || allBlown) return;
    const excludeIds = CONFIG.people.filter((p) => state[p.id].blown).map((p) => p.id);
    if (excludeIds.length >= CONFIG.people.length) return;

    spinning = true;
    cake.clearArmedHighlight();
    document.getElementById("spin-btn").disabled = true;
    setBlowUiVisible(false);
    setStatus("🎡 Girando la tarta...");

    const landedId = await cake.spinToRandom(excludeIds);
    spinning = false;

    if (!landedId) return; // no debería pasar: ya comprobamos candidatos arriba
    armCandle(landedId);
  }

  // ---------- porciones: mordisco + cómic ----------

  function enterBitePhase() {
    setStatus("¡Todas las velas apagadas! Ahora toca cada porción para darle un mordisco 🍰");
    document.getElementById("spin-btn").disabled = true;
    document.getElementById("spin-btn").hidden = true;
    setBlowUiVisible(false);
    cake.setSlicesInteractive(true);
  }

  async function onSliceChosen(id) {
    const s = state[id];
    if (!allBlown || !s.blown || s.eaten) return;
    s.eaten = true;

    playNomSound();
    await cake.biteSlice(id);
    updateLegend(id);

    const remaining = CONFIG.people.filter((p) => !state[p.id].eaten);
    setStatus(
      remaining.length === 0
        ? "¡Feliz cumpleaños a los cuatro! 🎉🎂"
        : "¡Ñam! Sigue mordiendo el resto de porciones."
    );

    openComic(id);
  }

  // ---------- modal cómic (idéntico al comportamiento anterior) ----------

  function openComic(id) {
    modalPerson = personById(id);
    modalIndex = 0;
    document.getElementById("modal-title").textContent = `El cómic de ${modalPerson.name}`;
    renderModalPage();
    document.getElementById("comic-modal").classList.remove("hidden");
  }

  function renderModalPage() {
    const gallery = document.getElementById("modal-gallery");
    const nav = document.getElementById("modal-nav");
    const counter = document.getElementById("modal-counter");
    const comics = modalPerson.comics || [];

    gallery.innerHTML = "";

    if (comics.length === 0) {
      gallery.innerHTML = `
        <div class="comic-placeholder">
          <span class="big-emoji">📔✨</span>
          <p>El cómic de <strong>${modalPerson.name}</strong> está de camino.</p>
          <p>Se mostrará aquí en cuanto subas las imágenes a<br>
          <code>assets/comics/${modalPerson.id}/</code> y las añadas en <code>js/config.js</code>.</p>
        </div>`;
      nav.classList.add("single-page");
      counter.textContent = "";
      return;
    }

    const img = document.createElement("img");
    img.src = comics[modalIndex];
    img.alt = `Página ${modalIndex + 1} del cómic de ${modalPerson.name}`;
    img.onerror = () => {
      gallery.innerHTML = `
        <div class="comic-placeholder">
          <span class="big-emoji">🖼️❓</span>
          <p>No se encuentra la imagen:<br><code>${comics[modalIndex]}</code></p>
          <p>Comprueba que el archivo está subido en esa ruta exacta.</p>
        </div>`;
    };
    gallery.appendChild(img);

    if (comics.length > 1) {
      nav.classList.remove("single-page");
      counter.textContent = `${modalIndex + 1} / ${comics.length}`;
      document.getElementById("prev-btn").disabled = modalIndex === 0;
      document.getElementById("next-btn").disabled = modalIndex === comics.length - 1;
    } else {
      nav.classList.add("single-page");
      counter.textContent = "";
    }
  }

  function closeComic() {
    document.getElementById("comic-modal").classList.add("hidden");
    modalPerson = null;
  }

  function bindModalControls() {
    document.getElementById("modal-close").addEventListener("click", closeComic);
    document.getElementById("modal-backdrop").addEventListener("click", closeComic);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeComic();
    });
    document.getElementById("prev-btn").addEventListener("click", () => {
      if (modalIndex > 0) { modalIndex--; renderModalPage(); }
    });
    document.getElementById("next-btn").addEventListener("click", () => {
      if (modalPerson && modalIndex < modalPerson.comics.length - 1) { modalIndex++; renderModalPage(); }
    });
  }

  // ---------- entrada: teclado y botón táctil de soplido ----------

  function bindBlowControls() {
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !e.repeat) {
        const tag = (e.target && e.target.tagName) || "";
        if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        startCharge();
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Space") cancelCharge();
    });

    const blowBtn = document.getElementById("blow-btn");
    blowBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); startCharge(); });
    blowBtn.addEventListener("pointerup", cancelCharge);
    blowBtn.addEventListener("pointercancel", cancelCharge);
    blowBtn.addEventListener("pointerleave", cancelCharge);
  }

  // ---------- arranque ----------

  function init() {
    buildBackground();

    const people = CONFIG.people;
    CONFIG.people.forEach((p) => { state[p.id] = { blown: false, eaten: false }; });
    renderLegend(displayNames(people));

    const canvas = document.getElementById("cake-canvas");
    cake = window.Cake3D.create({ canvas, people });
    cake.onSliceClick(onSliceChosen);

    document.getElementById("spin-btn").addEventListener("click", onSpinClick);
    bindBlowControls();
    bindModalControls();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
