import { writeFile } from "node:fs/promises";

const cdpPort = process.env.CDP_PORT || "9223";
const siteUrl = process.env.SITE_URL || "http://127.0.0.1:4173/index.html?test=1";
const screenshotPath = process.env.SCREENSHOT_PATH || "/tmp/cumpleanos-fatal-3d.png";
const seatScreenshotPath = process.env.SEAT_SCREENSHOT_PATH || "/tmp/cumpleanos-fatal-seat.png";
const mobileScreenshotPath = process.env.MOBILE_SCREENSHOT_PATH || "/tmp/cumpleanos-fatal-mobile.png";
const separator = siteUrl.includes("?") ? "&" : "?";
const runId = Date.now();
const desktopUrl = `${siteUrl}${separator}run=${runId}`;
const mobileUrl = `${siteUrl}${separator}run=${runId}&mobile=1`;
const productionUrlObject = new URL(siteUrl);
productionUrlObject.searchParams.delete("test");
productionUrlObject.searchParams.set("verifySpin", String(runId));
const productionUrl = productionUrlObject.href;
const geidoPageUrlObject = new URL("personas/geido-senchaz.html", siteUrl);
geidoPageUrlObject.searchParams.set("routeTest", String(runId));
const geidoPageUrl = geidoPageUrlObject.href;
const carlosPageUrlObject = new URL("personas/carlos-conde.html", siteUrl);
carlosPageUrlObject.searchParams.set("routeTest", String(runId));
const carlosPageUrl = carlosPageUrlObject.href;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(check, message, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

const targets = await fetch(`http://127.0.0.1:${cdpPort}/json`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === "page");
assert(target, "Chrome no expone una pestaña para la prueba");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const errors = [];
let commandId = 0;

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result || {});
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    errors.push(message.params.exceptionDetails.text || "Excepción JavaScript");
  }
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    const entry = message.params.entry;
    const expectedMissingAsset = entry.source === "network" && /404|Failed to load resource/i.test(entry.text);
    if (!entry.url?.includes("/assets/audio/") && !entry.url?.includes("/assets/lyrics/") && !expectedMissingAsset) {
      errors.push(entry.text);
    }
  }
});

function send(method, params = {}) {
  commandId += 1;
  const id = commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function state() {
  return evaluate("window.__birthdayTest && window.__birthdayTest.getState()");
}

await Promise.all([send("Page.enable"), send("Runtime.enable"), send("Log.enable"), send("Network.enable")]);
await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Page.navigate", { url: desktopUrl });

await waitFor(
  () => evaluate(`${JSON.stringify(desktopUrl)} === location.href && window.__birthdayReady === true && Boolean(window.__birthdayTest)`),
  "La escena 3D no terminó de arrancar"
);

const initialUi = await evaluate(`(() => {
  const canvas = document.getElementById("cake-canvas").getBoundingClientRect();
  const dock = document.querySelector(".party-dock").getBoundingClientRect();
  return {
    textLength: document.body.innerText.trim().length,
    fallbackHidden: document.getElementById("scene-fallback").hidden,
    canvas: { width: canvas.width, height: canvas.height },
    dockBottom: Math.round(dock.bottom),
    buttonDisabled: document.getElementById("spin-btn").disabled,
    chipCount: document.querySelectorAll(".legend-item").length,
    chipNames: [...document.querySelectorAll(".legend-name")].map((item) => item.textContent),
    firstLink: document.querySelector(".person-link")?.getAttribute("href"),
    description: document.querySelector('meta[name="description"]')?.content,
    socialImage: document.querySelector('meta[property="og:image"]')?.content,
  };
})()`);
assert(initialUi.textLength > 80, "La página se ha renderizado vacía");
assert(initialUi.fallbackHidden, "Se mostró el fallback en vez de la escena 3D");
assert(initialUi.canvas.width >= 1000 && initialUi.canvas.height >= 700, "El canvas no ocupa la escena");
assert(initialUi.dockBottom === 800, "La barra de personas no está fijada abajo");
assert(initialUi.chipCount === 4, "No aparecen las cuatro personas");
assert(initialUi.chipNames[0] === "Geido Senchaz", "El nuevo nombre de Geido no aparece en la mesa");
assert(initialUi.firstLink === "personas/geido-senchaz.html", "La página individual de Geido no está enlazada");
assert(initialUi.description.includes("Geido"), "Los metadatos principales conservan el nombre antiguo");
assert(initialUi.socialImage.endsWith("/public/og.png"), "La nueva tarjeta social no está enlazada");
assert(!initialUi.buttonDisabled, "La ruleta empieza bloqueada");

const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

const sceneState = (await state()).scene;
assert(sceneState.placeSettings.length === 4, "No hay cuatro sitios preparados en la mesa");
assert(
  JSON.stringify(sceneState.placeSettings.map((setting) => setting.drinkType)) === JSON.stringify(["beer", "wine", "beer", "wine"]),
  "Las bebidas no respetan config.js"
);
assert(sceneState.placeSettings.every((setting) => setting.hasLiquid), "Hay vasos sin líquido visible");
assert(
  sceneState.placeSettings.filter((setting) => setting.drinkType === "beer").every((setting) => setting.hasFoam),
  "A una cerveza le falta espuma"
);
assert(sceneState.productionSpinDurationMs >= 7000, "La ruleta de producción no es lo bastante lenta");
assert(sceneState.walkers.length >= 8, "Faltan invitados low-poly caminando por la sala");
assert(sceneState.walkers.filter((walker) => walker.kind === "girl").length >= 3, "Faltan chicas entre los invitados");
assert(
  ["hat", "cap", "beard"].every((accessory) => sceneState.walkers.some((walker) => walker.accessory === accessory)),
  "Los invitados no tienen suficientes rasgos variados"
);
assert(sceneState.walkers.every((walker) => !walker.intersectsFurniture), "Un invitado atraviesa la mesa o una silla");

const walkerBefore = sceneState.walkers.map((walker) => walker.position);
await new Promise((resolve) => setTimeout(resolve, 260));
const walkerAfter = (await state()).scene.walkers;
assert(
  walkerAfter.some((walker, index) => Math.hypot(
    walker.position.x - walkerBefore[index].x,
    walker.position.z - walkerBefore[index].z
  ) > 0.005),
  "Los invitados no avanzan por sus recorridos"
);
assert(walkerAfter.every((walker) => !walker.intersectsFurniture), "Un invitado entró en la zona del mobiliario");

const cakeDragStart = sceneState.cameraPose.azimuth;
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 410, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 750, y: 410, button: "left", buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 750, y: 410, button: "left", buttons: 0, clickCount: 1 });
const cakeDragEnd = (await state()).scene.cameraPose.azimuth;
assert(Math.abs(cakeDragEnd - cakeDragStart) < 0.02, "Arrastrar sobre la tarta movió la cámara");

const cameraBeforeDrag = cakeDragEnd;
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 25, y: 420, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 135, y: 420, button: "left", buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 135, y: 420, button: "left", buttons: 0, clickCount: 1 });
const cameraAfterDrag = (await state()).scene.cameraPose.azimuth;
assert(Math.abs(cameraAfterDrag - cameraBeforeDrag) > 0.3, "El arrastre con ratón no hizo orbitar la cámara");

await evaluate(`(() => {
  window.__lyricPreview = window.__birthdayTest.previewLyrics(["Primera línea", "Segunda línea", "Tercera línea"], 420);
  return true;
})()`);
await waitFor(async () => (await state()).karaoke.visible, "El karaoke de prueba no apareció");
const seenLyrics = [];
for (let sample = 0; sample < 12; sample++) {
  const lyricState = (await state()).karaoke;
  if (lyricState.visible && !seenLyrics.includes(lyricState.line)) seenLyrics.push(lyricState.line);
  await new Promise((resolve) => setTimeout(resolve, 45));
}
await evaluate("window.__lyricPreview");
const karaokeAfter = (await state()).karaoke;
assert(
  JSON.stringify(seenLyrics) === JSON.stringify(["Primera línea", "Segunda línea", "Tercera línea"]),
  `Las líneas de karaoke no avanzaron proporcionalmente: ${seenLyrics.join(" / ")}`
);
assert(!karaokeAfter.visible, "El karaoke no se ocultó al terminar la canción");

// Primera ronda: botón real y soplido real con la barra espaciadora.
await evaluate("document.getElementById('spin-btn').click()");
const dragDuringAutomaticMove = await evaluate("window.__birthdayTest.dragCamera(80)");
assert(dragDuringAutomaticMove === false, "El arrastre interrumpió un movimiento automático de cámara");
const firstId = await waitFor(async () => (await state()).activeCandleId, "La ruleta no eligió una vela");
const afterFirstSpin = await state();
assert(afterFirstSpin.scene.maxCameraFocus > 0.9, "La cámara no se acercó durante la ruleta");
assert(afterFirstSpin.scene.seatedPersonId === firstId, "La cámara no terminó en el asiento de la persona elegida");
const firstSetting = afterFirstSpin.scene.placeSettings.find((setting) => setting.id === firstId);
const expectedSeatAzimuth = Math.atan2(firstSetting.chairPosition.x, firstSetting.chairPosition.z);
assert(
  Math.abs(afterFirstSpin.scene.cameraPose.azimuth - expectedSeatAzimuth) < 0.02,
  "La cámara terminó en un asiento incorrecto"
);
await new Promise((resolve) => setTimeout(resolve, 100));
const seatScreenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(seatScreenshotPath, Buffer.from(seatScreenshot.data, "base64"));
assert(await evaluate("window.__birthdayTest.dragCamera(-35)"), "La cámara no volvió a responder tras llegar al asiento");
const blockedByActiveRound = await evaluate("window.__birthdayTest.spin()");
assert(blockedByActiveRound === null, "La ruleta permitió saltarse una vela activa");

await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
await new Promise((resolve) => setTimeout(resolve, 50));
const duringFirstSong = await state();
assert(duringFirstSong.people[firstId].blown, "La barra espaciadora no apagó la vela");
assert(duringFirstSong.songPlaying, "La ronda no quedó bloqueada durante la canción o aviso");
const blockedDuringFirstSong = await evaluate("window.__birthdayTest.spin()");
assert(blockedDuringFirstSong === null, "La ruleta giró durante una canción");
await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
await waitFor(async () => !(await state()).songPlaying, "El aviso de canción ausente dejó la fiesta bloqueada");

const chosenIds = [firstId];
for (let round = 1; round < 4; round++) {
  const selectedId = await evaluate("window.__birthdayTest.spin()");
  assert(selectedId && !chosenIds.includes(selectedId), "La ruleta repitió una porción ya completada");
  chosenIds.push(selectedId);

  const result = await evaluate(`(async () => {
    const test = window.__birthdayTest;
    const promise = test.blow();
    const during = test.getState();
    const blockedSpin = await test.spin();
    const blockedBlow = await test.blow();
    await promise;
    return { during, blockedSpin, blockedBlow, after: test.getState() };
  })()`);
  assert(result.during.songPlaying, "La canción no activó el bloqueo exclusivo");
  assert(result.blockedSpin === null, "Se pudo girar mientras sonaba la canción");
  assert(result.blockedBlow === false, "Se pudo volver a soplar durante la canción");
  assert(!result.after.songPlaying, "La canción o aviso no liberó la siguiente ronda");
}

const afterCandles = await state();
assert(new Set(chosenIds).size === 4, "La ruleta no eligió cuatro personas distintas");
assert(afterCandles.allBlown, "No se activó la fase de mordiscos tras las cuatro velas");
assert(afterCandles.scene.interactive, "Las porciones no quedaron interactivas");

// Cada clic elimina exactamente un triángulo; el cómic solo aparece al cuarto.
for (const personId of chosenIds) {
  const nomBefore = (await state()).nomSoundCount;
  for (let bite = 1; bite <= 4; bite++) {
    const result = await evaluate(`window.__birthdayTest.bite(${JSON.stringify(personId)})`);
    const biteState = await state();
    assert(result.bites === bite, `El mordisco ${bite} no actualizó la porción`);
    assert(biteState.people[personId].bites === bite, "El estado y la geometría de mordiscos no coinciden");
    assert(biteState.nomSoundCount === nomBefore + bite, "Falta un sonido ñam por mordisco");
    if (bite < 4) {
      assert(!biteState.people[personId].eaten, "La porción desapareció antes del cuarto mordisco");
      assert(!biteState.modalOpen, "El cómic se abrió antes de terminar la porción");
    } else {
      assert(biteState.people[personId].eaten, "La porción no terminó tras cuatro mordiscos");
      assert(biteState.modalOpen, "El cómic no se abrió al terminar la porción");
      await evaluate("window.__birthdayTest.closeComic()");
    }
  }
}

const finalState = await state();
assert(Object.values(finalState.people).every((person) => person.eaten), "No se completaron las cuatro porciones");
assert(finalState.nomSoundCount === 16, "El total de sonidos ñam no coincide con los mordiscos");

// Comprobación responsive tras recargar en tamaño móvil.
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Page.navigate", { url: mobileUrl });
await waitFor(
  () => evaluate(`${JSON.stringify(mobileUrl)} === location.href && window.__birthdayReady === true && Boolean(window.__birthdayTest)`),
  "La escena no arrancó en tamaño móvil"
);
const mobileUi = await evaluate(`(() => {
  const dock = document.querySelector(".party-dock").getBoundingClientRect();
  const spin = document.getElementById("spin-btn").getBoundingClientRect();
  return {
    viewport: { width: innerWidth, height: innerHeight },
    dock: { left: dock.left, right: dock.right, bottom: dock.bottom },
    spin: { left: spin.left, right: spin.right, top: spin.top, bottom: spin.bottom },
    overflow: document.documentElement.scrollWidth > innerWidth,
  };
})()`);
assert(!mobileUi.overflow, "La interfaz móvil tiene scroll horizontal");
assert(Math.round(mobileUi.dock.bottom) === mobileUi.viewport.height, "La barra móvil no está anclada abajo");
assert(mobileUi.spin.left >= 0 && mobileUi.spin.right <= mobileUi.viewport.width, "La ruleta queda fuera de la pantalla móvil");
const mobileScreenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(mobileScreenshotPath, Buffer.from(mobileScreenshot.data, "base64"));

const mobileAzimuthBefore = (await state()).scene.cameraPose.azimuth;
await send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: 24, y: 410, radiusX: 2, radiusY: 2, force: 1, id: 9 }],
});
await send("Input.dispatchTouchEvent", {
  type: "touchMove",
  touchPoints: [{ x: 132, y: 410, radiusX: 2, radiusY: 2, force: 1, id: 9 }],
});
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((resolve) => setTimeout(resolve, 60));
const mobileAzimuthAfter = (await state()).scene.cameraPose.azimuth;
assert(Math.abs(mobileAzimuthAfter - mobileAzimuthBefore) > 0.25, "El arrastre táctil no hizo orbitar la cámara");

// Alternativa táctil: giro y pulsación mantenida sobre el botón de soplar.
await evaluate("document.getElementById('spin-btn').click()");
await waitFor(async () => (await state()).activeCandleId, "La ruleta móvil no eligió una vela");
const blowPoint = await evaluate(`(() => {
  const rect = document.getElementById("blow-btn").getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()`);
await send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: blowPoint.x, y: blowPoint.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
});
await new Promise((resolve) => setTimeout(resolve, 55));
const touchState = await state();
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
assert(Object.values(touchState.people).some((person) => person.blown), "La pulsación táctil no apagó la vela");
await waitFor(async () => !(await state()).songPlaying, "El aviso móvil dejó la fiesta bloqueada");

// La ruta normal conserva una ruleta realmente lenta; ?test solo acelera el resto del recorrido.
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
});
await send("Emulation.setEmulatedMedia", {
  media: "screen",
  features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
});
await send("Page.navigate", { url: productionUrl });
await waitFor(
  () => evaluate(`${JSON.stringify(productionUrl)} === location.href && window.__birthdayReady === true`),
  "La escena de producción no terminó de arrancar"
);
await evaluate(`(() => {
  window.__productionSpinStarted = performance.now();
  document.getElementById("spin-btn").click();
  return true;
})()`);
await waitFor(
  () => evaluate("document.getElementById('cake-status').textContent.startsWith('¡Le toca a ')") ,
  "La ruleta lenta de producción no terminó",
  13000
);
const productionSpinElapsed = await evaluate("performance.now() - window.__productionSpinStarted");
assert(productionSpinElapsed >= 7400, `La ruleta de producción duró solo ${Math.round(productionSpinElapsed)} ms`);
assert(productionSpinElapsed < 11000, "La ruleta de producción tardó demasiado en llegar al asiento");

await send("Page.navigate", { url: geidoPageUrl });
await waitFor(
  () => evaluate(`${JSON.stringify(geidoPageUrl)} === location.href && document.body.dataset.personId === "geido"`),
  "La página individual de Geido no cargó"
);
const geidoPage = await evaluate(`({
  title: document.title,
  name: document.getElementById("person-name")?.textContent,
  songButton: document.getElementById("play-song")?.textContent,
  description: document.querySelector('meta[name="description"]')?.content,
})`);
assert(geidoPage.title.startsWith("Geido Senchaz"), "El título individual de Geido es incorrecto");
assert(geidoPage.name === "Geido Senchaz", "La página individual no muestra el nombre de Geido");
assert(geidoPage.songButton.includes("canción"), "La página individual de Geido no conserva su canción");
assert(geidoPage.description.includes("Geido Senchaz"), "La descripción individual de Geido es incorrecta");

await send("Page.navigate", { url: carlosPageUrl });
await waitFor(
  () => evaluate(`${JSON.stringify(carlosPageUrl)} === location.href && document.body.dataset.personId === "carlos"`),
  "La página individual de Carlos no cargó"
);
const carlosPage = await evaluate(`({
  title: document.title,
  name: document.getElementById("person-name")?.textContent,
})`);
assert(carlosPage.title.startsWith("Carlos Conde"), "La ruta representativa de Carlos perdió sus metadatos");
assert(carlosPage.name === "Carlos Conde", "La ruta representativa de Carlos perdió su contenido");

assert(errors.length === 0, `Errores del navegador: ${errors.join(" | ")}`);

console.log(JSON.stringify({
  ok: true,
  chosenIds,
  bites: finalState.nomSoundCount,
  comicsOpened: chosenIds.length,
  desktopScreenshot: screenshotPath,
  seatScreenshot: seatScreenshotPath,
  mobileScreenshot: mobileScreenshotPath,
  mobileViewport: mobileUi.viewport,
  browserErrors: errors,
  karaokeLines: seenLyrics,
  walkers: sceneState.walkers.length,
  productionSpinMs: Math.round(productionSpinElapsed),
  detailPages: [geidoPage.name, carlosPage.name],
}, null, 2));

socket.close();
