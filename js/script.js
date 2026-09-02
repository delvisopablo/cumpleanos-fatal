(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  // Geometría de la tarta (vista cenital, tipo icono, sin perspectiva)
  const CX = 260;         // centro X
  const CY = 230;         // centro Y de la tarta
  const R = 180;          // radio exterior de la tarta
  const DRUM_OFFSET = 14; // asoma del "bizcocho" bajo la nata, para dar volumen
  const SLICE_R = R - 16;
  const CANDLE_R = SLICE_R * 0.62;
  const CANDLE_H = 62;
  const CANDLE_HIT_R = 22;
  // Desplaza las porciones/velas para que las 4 velas queden en arriba/
  // derecha/abajo/izquierda (en vez de en las diagonales), bien repartidas.
  const ANGLE_OFFSET = -45;

  const state = {};       // { id: { blown, eaten } }
  let currentAudio = null;
  let modalPerson = null;
  let modalIndex = 0;

  function el(tag, attrs, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function polar(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 0) * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }

  function wedgePath(r, startDeg, endDeg) {
    const p1 = polar(0, 0, r, startDeg);
    const p2 = polar(0, 0, r, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M 0 0 L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} Z`;
  }

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

  function buildCake() {
    const svg = document.getElementById("cake-svg");
    const people = CONFIG.people;
    const n = people.length;
    const step = 360 / n;
    const names = displayNames(people);

    // defs
    const defs = el("defs", {}, svg);
    const flameGrad = el("radialGradient", { id: "flameGrad", cx: "50%", cy: "70%", r: "70%" }, defs);
    el("stop", { offset: "0%", "stop-color": "#fff6c8" }, flameGrad);
    el("stop", { offset: "45%", "stop-color": "#ffb347" }, flameGrad);
    el("stop", { offset: "100%", "stop-color": "#ff5d3d" }, flameGrad);

    // sombra de la tarta sobre la mesa
    el("ellipse", {
      cx: CX, cy: CY + R + 14, rx: R + 30, ry: 22,
      fill: "rgba(0,0,0,0.28)"
    }, svg);

    // "bizcocho" asomando bajo la nata, para dar volumen
    el("circle", { cx: CX, cy: CY + DRUM_OFFSET, r: R, fill: "#e7b06b" }, svg);

    // superficie superior (nata)
    el("circle", { cx: CX, cy: CY, r: R, fill: "#fff6e9" }, svg);

    // porciones
    const sliceGroup = el("g", { transform: `translate(${CX} ${CY})` }, svg);
    people.forEach((p, i) => {
      const start = i * step + ANGLE_OFFSET;
      const end = start + step;
      const slice = el("path", {
        d: wedgePath(SLICE_R, start, end),
        fill: p.color,
        class: "slice",
        id: `slice-${p.id}`,
        "data-person": p.id
      }, sliceGroup);
      slice.addEventListener("click", () => onSliceClick(p.id));
      // línea de separación
      const line = polar(0, 0, SLICE_R, start);
      el("line", { x1: 0, y1: 0, x2: line.x, y2: line.y, stroke: "rgba(255,255,255,0.55)", "stroke-width": 2 }, sliceGroup);
    });

    // borde decorativo de nata (piping)
    for (let a = 0; a < 360; a += 14) {
      const rad = (a * Math.PI) / 180;
      const px = CX + (R - 6) * Math.sin(rad);
      const py = CY - (R - 6) * Math.cos(rad);
      el("circle", { cx: px.toFixed(2), cy: py.toFixed(2), r: 3, fill: "#ffffff" }, svg);
    }

    // velas
    people.forEach((p, i) => {
      const mid = i * step + step / 2 + ANGLE_OFFSET;
      const rad = (mid * Math.PI) / 180;
      const ax = CX + CANDLE_R * Math.sin(rad);
      const ay = CY - CANDLE_R * Math.cos(rad);

      const g = el("g", { class: "candle", id: `candle-${p.id}`, transform: `translate(${ax.toFixed(2)} ${ay.toFixed(2)})` }, svg);

      el("rect", { x: -8, y: -CANDLE_H, width: 16, height: CANDLE_H, rx: 3, fill: p.color, stroke: "rgba(0,0,0,0.15)", "stroke-width": 1 }, g);
      el("rect", { x: -8, y: -CANDLE_H + 10, width: 16, height: 6, fill: "rgba(255,255,255,0.55)" }, g);
      el("rect", { x: -8, y: -CANDLE_H + 30, width: 16, height: 6, fill: "rgba(255,255,255,0.55)" }, g);
      el("line", { x1: 0, y1: -CANDLE_H, x2: 0, y2: -CANDLE_H - 10, stroke: "#6b4a2f", "stroke-width": 2 }, g);

      const flameGroup = el("g", { class: "flame-group", transform: `translate(0 ${-CANDLE_H - 10})` }, g);
      el("ellipse", { class: "flame-glow", cx: 0, cy: -6, rx: 18, ry: 20, fill: "url(#flameGrad)", opacity: 0.6 }, flameGroup);
      el("path", {
        class: "flame",
        d: "M0,-24 C7,-16 8,-6 0,2 C-8,-6 -7,-16 0,-24 Z",
        fill: "url(#flameGrad)"
      }, flameGroup);

      const smoke = el("path", {
        class: "smoke-curl",
        d: "M0,-10 C6,-16 -6,-22 0,-28 C6,-34 -4,-40 2,-46",
        fill: "none", stroke: "#c9c9c9", "stroke-width": 3, "stroke-linecap": "round",
        transform: `translate(0 ${-CANDLE_H - 10})`
      }, g);

      const hit = el("circle", { class: "candle-hit", cx: 0, cy: -CANDLE_H - 14, r: CANDLE_HIT_R, fill: "transparent" }, g);
      hit.addEventListener("click", () => onCandleClick(p.id));

      state[p.id] = { blown: false, eaten: false };
    });

    // pie de foto: nombres sobre la tarta (leyenda) — se construye aparte
    renderLegend(names);
  }

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

  function spawnPuffs(id) {
    const candle = document.getElementById(`candle-${id}`);
    const layer = candle;
    for (let i = 0; i < 6; i++) {
      const c = el("circle", {
        class: "puff",
        cx: (Math.random() - 0.5) * 14,
        cy: -CANDLE_H - 14,
        r: 4 + Math.random() * 4
      }, layer);
      c.style.animationDelay = `${i * 0.04}s`;
      c.addEventListener("animationend", () => c.remove());
      setTimeout(() => c.remove(), 1200);
    }
  }

  function onCandleClick(id) {
    if (state[id].blown) return;
    state[id].blown = true;

    const candle = document.getElementById(`candle-${id}`);
    candle.classList.add("blown");
    spawnPuffs(id);

    document.getElementById(`slice-${id}`).classList.add("unlocked");
    updateLegend(id);

    playSong(id);
  }

  function playSong(id) {
    const person = CONFIG.people.find((p) => p.id === id);
    if (!currentAudio) {
      currentAudio = new Audio();
      currentAudio.addEventListener("error", () => {
        // ignorado aquí: el aviso ya lo damos desde el catch de play()
      });
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

  function onSliceClick(id) {
    const s = state[id];
    if (!s.blown || s.eaten) return;
    s.eaten = true;

    const slice = document.getElementById(`slice-${id}`);
    spawnCrumbs(id);
    slice.classList.add("eaten");
    updateLegend(id);

    setTimeout(() => openComic(id), 350);
  }

  function spawnCrumbs(id) {
    const person = CONFIG.people.find((p) => p.id === id);
    const idx = CONFIG.people.findIndex((p) => p.id === id);
    const step = 360 / CONFIG.people.length;
    const mid = idx * step + step / 2 + ANGLE_OFFSET;
    const rad = (mid * Math.PI) / 180;
    const cx = CX + SLICE_R * 0.55 * Math.sin(rad);
    const cy = CY - SLICE_R * 0.55 * Math.cos(rad);

    const svg = document.getElementById("cake-svg");
    for (let i = 0; i < 10; i++) {
      const crumb = el("circle", {
        class: "crumb",
        cx: cx + (Math.random() - 0.5) * 30,
        cy: cy + (Math.random() - 0.5) * 20,
        r: 2 + Math.random() * 3,
        style: `--crumb-color:${person.color}`
      }, svg);
      crumb.style.transition = "transform 0.6s ease-in, opacity 0.6s ease-in";
      requestAnimationFrame(() => {
        crumb.style.transform = `translateY(${30 + Math.random() * 30}px)`;
        crumb.style.opacity = "0";
      });
      setTimeout(() => crumb.remove(), 700);
    }
  }

  // ---------- modal cómic ----------

  function openComic(id) {
    modalPerson = CONFIG.people.find((p) => p.id === id);
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

  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 4200);
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

  function init() {
    buildBackground();
    buildCake();
    bindModalControls();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
