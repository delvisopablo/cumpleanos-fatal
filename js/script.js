/* global Cake3D */

// Estado y reglas de la fiesta: ruleta, soplido, canción exclusiva,
// mordiscos progresivos y modal. La geometría vive en cake3d.js.
(function (global) {
  "use strict";

  const CONFIG = global.CONFIG;
  const TEST_MODE = new URLSearchParams(global.location.search).has("test");
  const BLOW_SUSTAIN_MS = TEST_MODE ? 30 : 130;
  const FALLBACK_HOLD_MS = TEST_MODE ? 120 : 900;
  const BLOW_LEVEL_THRESHOLD = 0.48;
  const MISSING_AUDIO_NOTICE_MS = TEST_MODE ? 90 : 1700;
  const AUDIO_LOAD_TIMEOUT_MS = TEST_MODE ? 350 : 5500;
  const BITE_STEPS = global.Cake3D ? global.Cake3D.BITE_STEPS : 4;
  const PERSON_PAGES = {
    hungryman: "personas/hungryman.html",
    dientes: "personas/dientes.html",
    carlos: "personas/carlos-conde.html",
    daviles: "personas/daviles.html",
  };

  const state = {};
  let cake = null;
  let activeCandleId = null;
  let spinning = false;
  let songPlaying = false;
  let allBlown = false;
  let currentAudio = null;
  let nomSoundCount = 0;
  let songExperienceRun = null;

  let modalPerson = null;
  let modalKind = null;
  let modalIndex = 0;
  let modalReturnFocus = null;
  const viewedComicIds = new Set();
  let groupComicUnlocked = false;

  function displayNames(people) {
    if (people.every((person) => person.displayName)) {
      return people.map((person) => person.displayName);
    }
    const counts = {};
    people.forEach((person) => { counts[person.name] = (counts[person.name] || 0) + 1; });
    const seen = {};
    return people.map((person) => {
      if (counts[person.name] > 1) {
        seen[person.name] = (seen[person.name] || 0) + 1;
        return `${person.name} (${seen[person.name]})`;
      }
      return person.name;
    });
  }

  function personById(id) {
    return CONFIG.people.find((person) => person.id === id);
  }

  async function loadNpcData() {
    if (global.location.protocol === "file:") return { npcs: [] };
    try {
      const response = await fetch("assets/npcs/phrases.json", { cache: "no-store" });
      if (!response.ok) return { npcs: [] };
      const data = await response.json();
      return data && Array.isArray(data.npcs) ? data : { npcs: [] };
    } catch (error) {
      return { npcs: [] };
    }
  }

  function showToast(message, duration = 4200) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), duration);
  }

  function setStatus(message) {
    document.getElementById("cake-status").textContent = message;
  }

  function renderLegend(names) {
    const list = document.getElementById("legend");
    list.innerHTML = "";

    CONFIG.people.forEach((person, index) => {
      const item = document.createElement("li");
      item.className = "legend-item";
      item.id = `legend-${person.id}`;
      item.style.setProperty("--person-color", person.color);

      const link = document.createElement("a");
      link.className = "person-link";
      link.href = PERSON_PAGES[person.id] || "index.html";

      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.setAttribute("aria-hidden", "true");

      const name = document.createElement("span");
      name.className = "legend-name";
      name.textContent = names[index];

      const status = document.createElement("span");
      status.className = "legend-status";
      status.setAttribute("aria-hidden", "true");

      const progress = document.createElement("span");
      progress.className = "legend-progress";
      progress.setAttribute("aria-hidden", "true");

      link.append(dot, name, status, progress);
      item.appendChild(link);
      list.appendChild(item);
      updateLegend(person.id);
    });
  }

  function updateLegend(id) {
    const itemState = state[id];
    const person = personById(id);
    const item = document.getElementById(`legend-${id}`);
    if (!item || !itemState || !person) return;

    const status = item.querySelector(".legend-status");
    const link = item.querySelector(".person-link");
    const displayName = person.displayName || person.name;
    const percent = Math.round((itemState.bites / BITE_STEPS) * 100);

    item.classList.toggle("is-active", activeCandleId === id);
    item.classList.toggle("is-complete", itemState.eaten);
    item.style.setProperty("--progress", `${percent}%`);

    if (itemState.eaten) status.textContent = "😋";
    else if (itemState.bites > 0) status.textContent = "🍴";
    else if (itemState.blown) status.textContent = "🍰";
    else if (activeCandleId === id) status.textContent = "✨";
    else status.textContent = "🕯️";

    const stateLabel = itemState.eaten
      ? "porción terminada"
      : itemState.bites > 0
        ? `${itemState.bites} de ${BITE_STEPS} mordiscos`
        : itemState.blown
          ? "vela apagada"
          : activeCandleId === id
            ? "vela activa"
            : "vela pendiente";
    link.setAttribute("aria-label", `Abrir la página de ${displayName}; ${stateLabel}`);
  }

  function updateAllLegend() {
    CONFIG.people.forEach((person) => updateLegend(person.id));
  }

  function updateSpinButton() {
    const button = document.getElementById("spin-btn");
    const label = button.querySelector("span:last-child");
    const blocked = spinning || songPlaying || Boolean(activeCandleId) || allBlown || !cake;
    button.disabled = blocked;
    button.hidden = allBlown;

    if (allBlown) label.textContent = "A comer";
    else if (songPlaying) label.textContent = "Escuchando…";
    else if (spinning) label.textContent = "Girando…";
    else if (activeCandleId) label.textContent = "Sopla la vela";
    else label.textContent = "Girar la tarta";
  }

  async function loadLyrics(person) {
    if (global.location.protocol === "file:") return [];
    if (!person || !person.lyrics) return [];
    try {
      const response = await fetch(person.lyrics, { cache: "no-store" });
      if (!response.ok) return [];
      const text = await response.text();
      return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  function hideSongExperience(completed = false) {
    const run = songExperienceRun;
    songExperienceRun = null;
    if (run && run.frame) global.cancelAnimationFrame(run.frame);
    const panel = document.getElementById("song-experience");
    if (panel) panel.classList.add("hidden");
    const photoWrap = document.getElementById("song-photo-wrap");
    if (photoWrap) photoWrap.classList.add("hidden");
    if (run && run.resolve) run.resolve(completed);
  }

  function startSongExperience(person, lines, durationSeconds, getCurrentTime) {
    hideSongExperience(false);
    const photos = Array.isArray(person.songPhotos) ? person.songPhotos.filter(Boolean) : [];
    const lyricLines = Array.isArray(lines) ? lines : [];
    if ((lyricLines.length === 0 && photos.length === 0) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return Promise.resolve(false);
    }

    const panel = document.getElementById("song-experience");
    const viewport = document.getElementById("lyrics-viewport");
    const crawl = document.getElementById("lyrics-crawl");
    const personLabel = document.getElementById("lyrics-person");
    const titleLabel = document.getElementById("lyrics-title");
    const copy = document.getElementById("lyrics-copy");
    const photoWrap = document.getElementById("song-photo-wrap");
    const photo = document.getElementById("song-photo");
    const title = lyricLines[0] || "";
    const bodyLines = lyricLines.slice(1);

    personLabel.textContent = `Canción de ${person.name}`;
    titleLabel.textContent = title;
    copy.replaceChildren();
    bodyLines.forEach((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      copy.appendChild(paragraph);
    });
    viewport.hidden = lyricLines.length === 0;
    photoWrap.classList.toggle("hidden", photos.length === 0);
    photo.alt = photos.length > 0 ? `Recuerdo de ${person.name}` : "";
    panel.classList.remove("hidden");

    return new Promise((resolve) => {
      const run = { frame: null, resolve, progress: 0, photoIndex: -1 };
      songExperienceRun = run;

      function showPhoto(index) {
        if (photos.length === 0 || index === run.photoIndex) return;
        run.photoIndex = index;
        photo.classList.add("is-changing");
        global.setTimeout(() => {
          if (songExperienceRun !== run) return;
          photoWrap.classList.remove("hidden");
          photo.src = photos[index];
          photo.classList.remove("is-changing");
        }, TEST_MODE ? 10 : 180);
      }

      photo.onerror = () => photoWrap.classList.add("hidden");

      function update() {
        if (songExperienceRun !== run) return;
        const currentTime = Math.max(0, Number(getCurrentTime()) || 0);
        const ratio = Math.min(1, currentTime / durationSeconds);
        run.progress = ratio;
        if (lyricLines.length > 0) {
          const startY = viewport.clientHeight * 0.94;
          const endY = -(crawl.scrollHeight + 24);
          const offset = startY + (endY - startY) * ratio;
          crawl.style.transform = `translateY(${offset}px) rotateX(9deg)`;
        }
        if (photos.length > 0) {
          showPhoto(Math.min(photos.length - 1, Math.floor(ratio * photos.length)));
        }
        if (ratio >= 1) {
          hideSongExperience(true);
          return;
        }
        run.frame = global.requestAnimationFrame(update);
      }

      run.frame = global.requestAnimationFrame(update);
    });
  }

  function previewSongForTest(lines, durationMs, photos = []) {
    const startedAt = performance.now();
    return startSongExperience(
      { ...CONFIG.people[0], songPhotos: photos },
      lines,
      Math.max(1, durationMs) / 1000,
      () => (performance.now() - startedAt) / 1000
    );
  }

  function playSong(id) {
    const person = personById(id);
    const lyricsPromise = loadLyrics(person);
    return new Promise((resolve) => {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.removeAttribute("src");
      }
      hideSongExperience(false);

      const audio = new Audio();
      currentAudio = audio;
      let finished = false;
      let missingStarted = false;
      let noticeTimer = null;

      const loadTimer = setTimeout(() => handleMissing(), AUDIO_LOAD_TIMEOUT_MS);

      function cleanup() {
        clearTimeout(loadTimer);
        clearTimeout(noticeTimer);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleMissing);
        audio.removeEventListener("loadedmetadata", handleMetadata);
      }

      function finish(result) {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(result);
      }

      function handleEnded() {
        hideSongExperience(true);
        finish({ played: true, missing: false });
      }

      async function handleMetadata() {
        const lines = await lyricsPromise;
        if (finished || currentAudio !== audio) return;
        startSongExperience(person, lines, audio.duration, () => audio.currentTime);
      }

      function handleMissing() {
        if (finished || missingStarted) return;
        missingStarted = true;
        clearTimeout(loadTimer);
        audio.pause();
        hideSongExperience(false);
        showToast(`🎵 La canción de ${person.displayName || person.name} aún no está subida. La fiesta continúa.`, MISSING_AUDIO_NOTICE_MS);
        noticeTimer = setTimeout(() => finish({ played: false, missing: true }), MISSING_AUDIO_NOTICE_MS);
      }

      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleMissing);
      audio.addEventListener("loadedmetadata", handleMetadata, { once: true });
      audio.preload = "auto";
      audio.src = person.audio;

      try {
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(handleMissing);
        }
      } catch (error) {
        handleMissing();
      }
    });
  }

  let sfxContext = null;

  function getSfxContext() {
    if (!sfxContext) {
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (!AudioContextClass) return null;
      sfxContext = new AudioContextClass();
    }
    return sfxContext;
  }

  function playNomSound() {
    nomSoundCount += 1;
    try {
      const context = getSfxContext();
      if (!context) return;
      if (context.state === "suspended") context.resume();

      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(190, now);
      oscillator.frequency.exponentialRampToValueAtTime(88, now + 0.22);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(760, now);
      filter.frequency.exponentialRampToValueAtTime(290, now + 0.22);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.34, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      oscillator.connect(filter).connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.25);
    } catch (error) {
      // El mordisco sigue funcionando aunque Web Audio no esté disponible.
    }
  }

  let micState = "closed";
  let micStream = null;
  let micContext = null;
  let micAnalyser = null;
  let micSamples = null;
  let breathAboveSince = null;
  let fallbackTimer = null;
  let holdingBlow = false;
  let micExplanationShown = false;

  function closeMicrophone() {
    if (micStream) micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
    micAnalyser = null;
    micSamples = null;
    if (micContext && micContext.state !== "closed") micContext.close().catch(() => {});
    micContext = null;
    micState = "closed";
  }

  function releaseBlowHold() {
    holdingBlow = false;
    breathAboveSince = null;
    if (fallbackTimer) global.clearTimeout(fallbackTimer);
    fallbackTimer = null;
    closeMicrophone();
    const button = document.getElementById("blow-btn");
    if (button) button.classList.remove("is-charging");
  }

  function processMicrophoneLevel(level, now = performance.now()) {
    if (!holdingBlow || micState !== "active" || !activeCandleId || songPlaying || spinning) {
      breathAboveSince = null;
      return false;
    }
    if (level >= BLOW_LEVEL_THRESHOLD) {
      if (breathAboveSince === null) breathAboveSince = now;
      else if (now - breathAboveSince >= BLOW_SUSTAIN_MS) {
        breathAboveSince = null;
        handleBlowSignal("microphone");
        return true;
      }
    } else {
      breathAboveSince = null;
    }
    return false;
  }

  function micLoop() {
    if (!holdingBlow || micState !== "active" || !micAnalyser || !micSamples) return;
    micAnalyser.getByteTimeDomainData(micSamples);
    let peak = 0;
    for (let index = 0; index < micSamples.length; index++) {
      peak = Math.max(peak, Math.abs((micSamples[index] - 128) / 128));
    }
    processMicrophoneLevel(peak);
    if (holdingBlow && micState === "active") global.requestAnimationFrame(micLoop);
  }

  function startFallbackHold() {
    micState = "fallback";
    fallbackTimer = global.setTimeout(() => {
      fallbackTimer = null;
      if (holdingBlow) handleBlowSignal("fallback");
    }, FALLBACK_HOLD_MS);
  }

  async function openMicrophoneForHold() {
    if (TEST_MODE || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      startFallbackHold();
      return false;
    }

    if (!micExplanationShown) {
      micExplanationShown = true;
      showToast("El micrófono se abre solo mientras mantienes pulsado y se usa únicamente para detectar el soplido.");
    }

    micState = "requesting";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      if (!holdingBlow) {
        stream.getTracks().forEach((track) => track.stop());
        micState = "closed";
        return false;
      }
      const AudioContextClass = global.AudioContext || global.webkitAudioContext;
      if (!AudioContextClass) {
        stream.getTracks().forEach((track) => track.stop());
        startFallbackHold();
        return false;
      }
      micStream = stream;
      micContext = new AudioContextClass();
      const source = micContext.createMediaStreamSource(micStream);
      micAnalyser = micContext.createAnalyser();
      micAnalyser.fftSize = 512;
      micAnalyser.smoothingTimeConstant = 0.35;
      source.connect(micAnalyser);
      micSamples = new Uint8Array(micAnalyser.fftSize);
      micState = "active";
      global.requestAnimationFrame(micLoop);
      return true;
    } catch (error) {
      if (!holdingBlow) return false;
      showToast("No se pudo abrir el micrófono. Mantén pulsado un segundo para usar el modo alternativo.");
      startFallbackHold();
      return false;
    }
  }

  function startBlowHold() {
    if (!activeCandleId || state[activeCandleId].blown || spinning || songPlaying || holdingBlow) return false;
    holdingBlow = true;
    document.getElementById("blow-btn").classList.add("is-charging");
    openMicrophoneForHold();
    return true;
  }

  function setBlowUiVisible(visible) {
    if (!visible) releaseBlowHold();
    document.getElementById("blow-btn").hidden = !visible;
    document.getElementById("cake-hint").hidden = !visible;
  }

  function handleBlowSignal(source) {
    const validSource = (holdingBlow && (source === "microphone" || source === "fallback")) || (TEST_MODE && source === "test");
    if (!validSource) return Promise.resolve(false);
    if (!activeCandleId || songPlaying || spinning || state[activeCandleId].blown) return Promise.resolve(false);
    return blowOutCandle(activeCandleId);
  }

  async function blowOutCandle(id) {
    const itemState = state[id];
    if (!itemState || itemState.blown || activeCandleId !== id || songPlaying) return false;

    const person = personById(id);
    itemState.blown = true;
    activeCandleId = null;
    songPlaying = true;
    breathAboveSince = null;
    releaseBlowHold();
    setBlowUiVisible(false);
    updateAllLegend();
    updateSpinButton();
    setStatus(`¡Vela de ${person.displayName || person.name} apagada! Ahora suena su canción 🎶`);

    const songPromise = playSong(id);
    try {
      await Promise.all([cake.blowOutCandle(id), songPromise]);
    } finally {
      songPlaying = false;
    }

    const remaining = CONFIG.people.filter((candidate) => !state[candidate.id].blown);
    if (remaining.length === 0) {
      allBlown = true;
      enterBitePhase();
    } else {
      setStatus(`Canción terminada. Quedan ${remaining.length} ${remaining.length === 1 ? "vela" : "velas"}; gira de nuevo.`);
      updateSpinButton();
    }
    return true;
  }

  function armCandle(id) {
    activeCandleId = id;
    const person = personById(id);
    setStatus(`¡Le toca a ${person.displayName || person.name}! Mantén pulsado el botón y sopla fuerte.`);
    setBlowUiVisible(true);
    updateAllLegend();
    updateSpinButton();
  }

  async function onSpinClick() {
    if (spinning || songPlaying || activeCandleId || allBlown || !cake) return null;
    const excludedIds = CONFIG.people
      .filter((person) => state[person.id].blown || state[person.id].eaten)
      .map((person) => person.id);
    if (excludedIds.length >= CONFIG.people.length) return null;

    spinning = true;
    cake.clearArmedHighlight();
    setBlowUiVisible(false);
    setStatus("La tarta gira a toda velocidad… ¿hacia quién apuntará al frenar?");
    updateAllLegend();
    updateSpinButton();

    try {
      const landedId = await cake.spinToRandom(excludedIds);
      spinning = false;
      if (landedId) armCandle(landedId);
      else updateSpinButton();
      return landedId;
    } catch (error) {
      spinning = false;
      updateSpinButton();
      setStatus("No hemos podido girar la tarta. Inténtalo otra vez.");
      showToast("La ruleta ha tropezado con el mantel. Prueba de nuevo.");
      return null;
    }
  }

  function enterBitePhase() {
    setStatus(`¡Las cuatro velas están apagadas! Cada porción necesita ${BITE_STEPS} mordiscos 🍰`);
    setBlowUiVisible(false);
    cake.setSlicesInteractive(true);
    updateAllLegend();
    updateSpinButton();
  }

  async function onSliceChosen(id) {
    const itemState = state[id];
    if (!allBlown || songPlaying || !itemState || !itemState.blown || itemState.eaten || itemState.biting) return null;

    itemState.biting = true;
    playNomSound();
    const result = await cake.biteSlice(id);
    itemState.biting = false;
    if (!result || result.ignored) return result;

    itemState.bites = result.bites;
    itemState.eaten = result.complete;
    updateLegend(id);

    const person = personById(id);
    if (result.complete) {
      const remainingSlices = CONFIG.people.filter((candidate) => !state[candidate.id].eaten);
      setStatus(
        remainingSlices.length === 0
          ? "¡No queda ni una miga! Feliz cumpleaños a los cuatro 🎉"
          : `¡Porción de ${person.displayName || person.name} terminada! Quedan ${remainingSlices.length}.`
      );
      openComic(id);
    } else {
      setStatus(`¡Ñam! A ${person.displayName || person.name} le quedan ${result.remaining} ${result.remaining === 1 ? "mordisco" : "mordiscos"}.`);
    }
    return result;
  }

  function openComic(id) {
    modalPerson = personById(id);
    modalKind = "individual";
    modalIndex = 0;
    modalReturnFocus = document.activeElement;
    document.getElementById("modal-title").textContent = `El cómic de ${modalPerson.displayName || modalPerson.name}`;
    renderModalPage();
    const modal = document.getElementById("comic-modal");
    modal.classList.remove("hidden");
    document.getElementById("modal-close").focus();
    viewedComicIds.add(id);
    if (viewedComicIds.size === CONFIG.people.length) unlockGroupComic();
  }

  function unlockGroupComic() {
    if (groupComicUnlocked) return;
    groupComicUnlocked = true;
    document.getElementById("group-comic-btn").hidden = false;
    showToast("📚 ¡Cómic final desbloqueado! La historia conjunta ya está disponible.");
  }

  function openGroupComic() {
    if (!groupComicUnlocked) return false;
    modalPerson = {
      id: "group",
      name: "los cuatro",
      comics: Array.isArray(CONFIG.groupComic && CONFIG.groupComic.comics)
        ? CONFIG.groupComic.comics
        : [],
    };
    modalKind = "group";
    modalIndex = 0;
    modalReturnFocus = document.activeElement;
    document.getElementById("modal-title").textContent = "Cómic final · La historia conjunta";
    renderModalPage();
    document.getElementById("comic-modal").classList.remove("hidden");
    document.getElementById("modal-close").focus();
    return true;
  }

  function renderModalPage() {
    const gallery = document.getElementById("modal-gallery");
    const navigation = document.getElementById("modal-nav");
    const counter = document.getElementById("modal-counter");
    const comics = modalPerson.comics || [];
    gallery.innerHTML = "";

    if (comics.length === 0) {
      const placeholder = document.createElement("div");
      placeholder.className = "comic-placeholder";
      placeholder.innerHTML = modalKind === "group"
        ? `<span class="big-emoji" aria-hidden="true">📚✨</span>
          <p>El <strong>cómic final de los cuatro</strong> está de camino.</p>
          <p>Se mostrará aquí cuando subas sus imágenes a<br>
          <code>assets/comics/group/</code> y las añadas en <code>CONFIG.groupComic.comics</code>.</p>`
        : `<span class="big-emoji" aria-hidden="true">📔✨</span>
          <p>El cómic de <strong>${modalPerson.displayName || modalPerson.name}</strong> está de camino.</p>
          <p>Se mostrará aquí cuando subas sus imágenes a<br>
          <code>assets/comics/${modalPerson.id}/</code> y las añadas en <code>js/config.js</code>.</p>`;
      gallery.appendChild(placeholder);
      navigation.classList.add("single-page");
      counter.textContent = "";
      return;
    }

    const image = document.createElement("img");
    image.src = comics[modalIndex];
    image.alt = modalKind === "group"
      ? `Página ${modalIndex + 1} del cómic final de los cuatro`
      : `Página ${modalIndex + 1} del cómic de ${modalPerson.displayName || modalPerson.name}`;
    image.onerror = () => {
      gallery.innerHTML = `
        <div class="comic-placeholder">
          <span class="big-emoji" aria-hidden="true">🖼️❓</span>
          <p>No se encuentra la imagen:<br><code>${comics[modalIndex]}</code></p>
          <p>Comprueba que el archivo esté en esa ruta exacta.</p>
        </div>`;
    };
    gallery.appendChild(image);

    navigation.classList.toggle("single-page", comics.length <= 1);
    counter.textContent = comics.length > 1 ? `${modalIndex + 1} / ${comics.length}` : "";
    document.getElementById("prev-btn").disabled = modalIndex === 0;
    document.getElementById("next-btn").disabled = modalIndex === comics.length - 1;
  }

  function closeComic() {
    const modal = document.getElementById("comic-modal");
    if (modal.classList.contains("hidden")) return;
    modal.classList.add("hidden");
    modalPerson = null;
    modalKind = null;
    if (modalReturnFocus && typeof modalReturnFocus.focus === "function") modalReturnFocus.focus();
  }

  function bindModalControls() {
    document.getElementById("modal-close").addEventListener("click", closeComic);
    document.getElementById("modal-backdrop").addEventListener("click", closeComic);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeComic();
    });
    document.getElementById("prev-btn").addEventListener("click", () => {
      if (modalIndex > 0) {
        modalIndex -= 1;
        renderModalPage();
      }
    });
    document.getElementById("next-btn").addEventListener("click", () => {
      if (modalPerson && modalIndex < modalPerson.comics.length - 1) {
        modalIndex += 1;
        renderModalPage();
      }
    });
    document.getElementById("group-comic-btn").addEventListener("click", openGroupComic);
  }

  function bindBlowControls() {
    const blowButton = document.getElementById("blow-btn");
    blowButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      startBlowHold();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
      blowButton.addEventListener(eventName, releaseBlowHold);
    });
  }

  function exposeTestApi() {
    if (!TEST_MODE) return;
    global.__birthdayTest = {
      spin: onSpinClick,
      blow: () => handleBlowSignal("test"),
      startBlowHold,
      endBlowHold: releaseBlowHold,
      microphoneLevel: processMicrophoneLevel,
      bite: onSliceChosen,
      dragCamera: (deltaX) => cake && cake.testDragBy(deltaX),
      previewSong: previewSongForTest,
      talkToNpc: (id) => cake && cake.talkToNpc(id),
      openGroupComic,
      closeComic,
      getState() {
        const peopleState = {};
        CONFIG.people.forEach((person) => { peopleState[person.id] = { ...state[person.id] }; });
        return {
          activeCandleId,
          spinning,
          songPlaying,
          allBlown,
          nomSoundCount,
          modalOpen: !document.getElementById("comic-modal").classList.contains("hidden"),
          modalKind,
          viewedComicIds: [...viewedComicIds],
          groupComic: {
            unlocked: groupComicUnlocked,
            buttonVisible: !document.getElementById("group-comic-btn").hidden,
            configuredPages: Array.isArray(CONFIG.groupComic && CONFIG.groupComic.comics)
              ? CONFIG.groupComic.comics.length
              : 0,
          },
          songExperience: {
            visible: !document.getElementById("song-experience").classList.contains("hidden"),
            title: document.getElementById("lyrics-title").textContent,
            lines: [...document.querySelectorAll("#lyrics-copy p")].map((line) => line.textContent),
            transform: document.getElementById("lyrics-crawl").style.transform,
            progress: songExperienceRun ? songExperienceRun.progress : 0,
            photoVisible: !document.getElementById("song-photo-wrap").classList.contains("hidden"),
            photoIndex: songExperienceRun ? songExperienceRun.photoIndex : -1,
          },
          microphone: {
            state: micState,
            holding: holdingBlow,
            hasStream: Boolean(micStream),
            threshold: BLOW_LEVEL_THRESHOLD,
            fallbackHoldMs: FALLBACK_HOLD_MS,
          },
          people: peopleState,
          scene: cake ? cake.getSnapshot() : null,
        };
      },
    };
  }

  function init() {
    if (!CONFIG || !Array.isArray(CONFIG.people) || CONFIG.people.length === 0) {
      document.getElementById("scene-fallback").hidden = false;
      return;
    }

    CONFIG.people.forEach((person) => {
      state[person.id] = { blown: false, eaten: false, bites: 0, biting: false };
    });
    renderLegend(displayNames(CONFIG.people));
    bindBlowControls();
    bindModalControls();

    if (!global.THREE || !global.Cake3D) {
      document.getElementById("scene-fallback").hidden = false;
      document.getElementById("spin-btn").disabled = true;
      setStatus("No se ha podido cargar Three.js.");
      exposeTestApi();
      return;
    }

    try {
      cake = global.Cake3D.create({
        canvas: document.getElementById("cake-canvas"),
        people: CONFIG.people,
        dialogLayer: document.getElementById("npc-dialog-layer"),
      });
      loadNpcData().then((data) => cake && cake.setNpcData(data));
      cake.onSliceClick(onSliceChosen);
      document.getElementById("spin-btn").addEventListener("click", onSpinClick);
      updateSpinButton();
      exposeTestApi();
      global.__birthdayReady = true;
    } catch (error) {
      console.error("No se pudo crear la escena 3D", error);
      document.getElementById("scene-fallback").hidden = false;
      document.getElementById("spin-btn").disabled = true;
      setStatus("No se ha podido encender la escena 3D.");
      exposeTestApi();
    }
  }

  global.addEventListener("beforeunload", () => {
    releaseBlowHold();
    if (cake) cake.dispose();
  });
  document.addEventListener("DOMContentLoaded", init);
})(window);
