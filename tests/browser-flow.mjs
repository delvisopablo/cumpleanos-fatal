import { writeFile } from "node:fs/promises";

const cdpPort = process.env.CDP_PORT || "9223";
const siteUrl = process.env.SITE_URL || "http://127.0.0.1:4173/index.html?test=1";
const screenshotPath = process.env.SCREENSHOT_PATH || "/tmp/cumpleanos-fatal-3d.png";
const spinScreenshotPath = process.env.SPIN_SCREENSHOT_PATH || "/tmp/cumpleanos-fatal-spin.png";
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

function closeEnough(first, second, tolerance = 0.03) {
  return Math.abs(first - second) <= tolerance;
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
    const optionalAsset = /\/assets\/(audio|lyrics|song-photos|comics)\//.test(entry.url || entry.text);
    const missingAsset = entry.source === "network" && /404|Failed to load resource/i.test(entry.text);
    if (!optionalAsset && !missingAsset) errors.push(entry.text);
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

async function clickAt(x, y) {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
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
    configKeys: CONFIG.people.map((person) => Object.keys(person).sort()),
    configNames: CONFIG.people.map((person) => person.name),
  };
})()`);
assert(initialUi.textLength > 80, "La página se ha renderizado vacía");
assert(initialUi.fallbackHidden, "Se mostró el fallback en vez de la escena 3D");
assert(initialUi.canvas.width >= 1000 && initialUi.canvas.height >= 700, "El canvas no ocupa la escena");
assert(initialUi.dockBottom === 800, "La barra de personas no está fijada abajo");
assert(initialUi.chipCount === 4, "No aparecen las cuatro personas");
assert(initialUi.chipNames[0] === "Geido Senchaz", "El nombre de Geido no aparece en la mesa");
assert(initialUi.firstLink === "personas/geido-senchaz.html", "La página individual de Geido no está enlazada");
assert(initialUi.description.includes("Geido"), "Los metadatos principales no incluyen a Geido");
assert(initialUi.socialImage.endsWith("/public/og.png"), "La tarjeta social no está enlazada");
assert(!initialUi.buttonDisabled, "La ruleta empieza bloqueada");
const expectedConfigKeys = ["audio", "color", "comics", "id", "lyrics", "name", "songPhotos"];
assert(
  initialUi.configKeys.every((keys) => JSON.stringify(keys) === JSON.stringify(expectedConfigKeys)),
  "config.js no conserva exactamente {id,name,color,audio,lyrics,songPhotos,comics}"
);
assert(
  JSON.stringify(initialUi.configNames) === JSON.stringify(["Geido Senchaz", "Diego Sánchez (2)", "Carlos Conde", "Daviles"]),
  "Los nombres de las cuatro personas no son los esperados"
);

const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

const loadedState = await waitFor(async () => {
  const current = await state();
  return current.scene.walkers.every((walker) => walker.phraseCount > 0) ? current : null;
}, "No se cargaron las frases de los 16 NPC");
const sceneState = loadedState.scene;
assert(sceneState.placeSettings.length === 4, "No hay cuatro sitios preparados en la mesa");
assert(
  JSON.stringify(sceneState.placeSettings.map((setting) => setting.drinkType)) === JSON.stringify(["beer", "wine", "beer", "wine"]),
  "Las bebidas alternas no se han creado"
);
assert(sceneState.placeSettings.every((setting) => setting.hasLiquid), "Hay vasos sin líquido visible");
assert(
  sceneState.placeSettings.filter((setting) => setting.drinkType === "beer").every((setting) => setting.hasFoam),
  "A una cerveza le falta espuma"
);
assert(sceneState.productionSpinDurationMs >= 7000, "La ruleta de producción no es lo bastante lenta");
assert(sceneState.cakeProfile.style === "minecraft-block", "La tarta no usa la geometría Minecraft");
assert(sceneState.cakeProfile.shape === "rectangular-prism", "La tarta no es un prisma rectangular");
assert(sceneState.cakeProfile.quadrantCount === 4, "La tapa no está dividida en una cuadrícula 2x2");
assert(sceneState.cakeProfile.biteSegmentsPerQuadrant === 4, "Cada cuadrante no tiene cuatro mordiscos triangulares");
assert(sceneState.cakeProfile.redCubeCount === 8, "Faltan los pequeños cubos rojos de la tapa");
assert(sceneState.walkers.length === 16, "No hay exactamente 16 invitados low-poly");
assert(
  JSON.stringify(sceneState.walkers.map((walker) => walker.id)) === JSON.stringify(Array.from({ length: 16 }, (_, index) => `npc-${String(index + 1).padStart(2, "0")}`)),
  "Los NPC no tienen los ids npc-01 a npc-16"
);
assert(sceneState.walkers.filter((walker) => walker.kind === "girl").length >= 6, "Faltan chicas entre los invitados");
assert(
  ["hat", "cap", "beard"].every((accessory) => sceneState.walkers.some((walker) => walker.accessory === accessory)),
  "Los invitados no tienen sombreros, gorras y barbas"
);
assert(sceneState.walkers.every((walker) => walker.phraseCount >= 3), "Algún NPC no recibió sus frases JSON");
assert(sceneState.walkers.every((walker) => !walker.intersectsFurniture), "Un invitado atraviesa la mesa o una silla");
assert(closeEnough(sceneState.cameraPose.radius, sceneState.overviewPose.radius), "La cámara inicial no usa la vista general");
assert(closeEnough(sceneState.cameraPose.height, sceneState.overviewPose.height), "La altura inicial no muestra la mesa desde fuera");

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

// Un clic real detiene al NPC, lo orienta a cámara y muestra su bocadillo.
const npcTarget = walkerAfter.find((walker) => (
  walker.screenPosition.visible && walker.screenPosition.x > 45 && walker.screenPosition.x < 1235 &&
  walker.screenPosition.y > 135 && walker.screenPosition.y < 670
));
assert(npcTarget, "No hay ningún NPC visible disponible para probar el diálogo");
await clickAt(npcTarget.screenPosition.x, npcTarget.screenPosition.y);
const speakingNpc = await waitFor(async () => {
  const walker = (await state()).scene.walkers.find((candidate) => candidate.id === npcTarget.id);
  return walker && walker.paused && walker.dialogVisible ? walker : null;
}, "Pinchar el NPC no lo detuvo ni mostró el bocadillo");
const dialogText = await evaluate("document.querySelector('.npc-dialog')?.textContent || ''");
assert(dialogText.includes(speakingNpc.name), "El bocadillo no muestra el nombre leído de phrases.json");
const pausedPosition = speakingNpc.position;
await new Promise((resolve) => setTimeout(resolve, 150));
const stillPaused = (await state()).scene.walkers.find((walker) => walker.id === npcTarget.id);
assert(
  Math.hypot(stillPaused.position.x - pausedPosition.x, stillPaused.position.z - pausedPosition.z) < 0.002,
  "El NPC siguió caminando mientras hablaba"
);
await clickAt(stillPaused.screenPosition.x, stillPaused.screenPosition.y);
await waitFor(async () => {
  const walker = (await state()).scene.walkers.find((candidate) => candidate.id === npcTarget.id);
  return walker && !walker.paused && !walker.dialogVisible;
}, "El segundo toque no ocultó el bocadillo ni reanudó al NPC");
await new Promise((resolve) => setTimeout(resolve, 180));
const resumedNpc = (await state()).scene.walkers.find((walker) => walker.id === npcTarget.id);
assert(
  Math.hypot(resumedNpc.position.x - pausedPosition.x, resumedNpc.position.z - pausedPosition.z) > 0.005,
  "El NPC no reanudó su paseo"
);

// La tarta bloquea el arrastre, pero una zona vacía permite la órbita horizontal.
const cakeDragStart = (await state()).scene.cameraPose.azimuth;
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 410, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 750, y: 410, button: "left", buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 750, y: 410, button: "left", buttons: 0, clickCount: 1 });
const cakeDragEnd = (await state()).scene.cameraPose.azimuth;
assert(Math.abs(cakeDragEnd - cakeDragStart) < 0.02, "Arrastrar sobre la tarta movió la cámara");

const cameraBeforeDrag = cakeDragEnd;
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 600, y: 180, button: "left", buttons: 1, clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 710, y: 180, button: "left", buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 710, y: 180, button: "left", buttons: 0, clickCount: 1 });
const cameraAfterDrag = (await state()).scene.cameraPose.azimuth;
assert(Math.abs(cameraAfterDrag - cameraBeforeDrag) > 0.3, "El arrastre con ratón no hizo orbitar la cámara");

// La letra avanza como un único scroll continuo y las fotos cambian durante la canción.
const pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
await evaluate(`(() => {
  window.__songPreview = window.__birthdayTest.previewSong(
    ["Título de prueba", "Primera línea", "Segunda línea", "Tercera línea"],
    720,
    [${JSON.stringify(pixel)}, ${JSON.stringify(pixel)}]
  );
  return true;
})()`);
await waitFor(async () => (await state()).songExperience.visible, "La cortinilla de prueba no apareció");
const crawlSamples = [];
for (let sample = 0; sample < 5; sample++) {
  await new Promise((resolve) => setTimeout(resolve, 90));
  const songState = (await state()).songExperience;
  if (songState.visible) crawlSamples.push(songState);
}
assert(crawlSamples.length >= 3, "La cortinilla desapareció antes de poder comprobarla");
assert(crawlSamples[0].title === "Título de prueba", "La primera línea no se muestra como título destacado");
assert(
  JSON.stringify(crawlSamples[0].lines) === JSON.stringify(["Primera línea", "Segunda línea", "Tercera línea"]),
  "La letra no conserva todas las líneas tras el título"
);
assert(
  crawlSamples.every((sample, index) => index === 0 || sample.progress >= crawlSamples[index - 1].progress) &&
    crawlSamples.at(-1).progress - crawlSamples[0].progress > 0.25,
  "La letra no avanza continuamente según la duración"
);
assert(new Set(crawlSamples.map((sample) => sample.transform)).size >= 3, "La cortinilla no cambia de posición de forma continua");
assert(crawlSamples.some((sample) => sample.photoVisible), "Las fotos de canción no aparecen junto a la letra");
assert(crawlSamples.some((sample) => sample.photoIndex === 1), "El carrusel no avanzó a la segunda foto");
await evaluate("window.__songPreview");
assert(!(await state()).songExperience.visible, "La cortinilla no se ocultó al terminar la canción");

// Primera ronda: giro real, vuelta al encuadre general y botón mantenido.
const overviewBeforeSpin = (await state()).scene.cameraPose;
await evaluate("document.getElementById('spin-btn').click()");
const dragDuringAutomaticMove = await evaluate("window.__birthdayTest.dragCamera(80)");
assert(dragDuringAutomaticMove === false, "El arrastre interrumpió el movimiento automático de cámara");
const firstId = await waitFor(async () => (await state()).activeCandleId, "La ruleta no eligió una vela");
const afterFirstSpin = await state();
assert(afterFirstSpin.scene.maxCameraFocus > 0.9, "La cámara no se acercó durante la ruleta");
const zoomRatio = afterFirstSpin.scene.minimumCameraRadius / overviewBeforeSpin.radius;
assert(zoomRatio >= 0.82 && zoomRatio <= 0.87, `El zoom no fue moderado: ${zoomRatio.toFixed(2)}`);
assert(closeEnough(afterFirstSpin.scene.cameraPose.radius, afterFirstSpin.scene.overviewPose.radius), "La cámara no volvió a la distancia general");
assert(closeEnough(afterFirstSpin.scene.cameraPose.height, afterFirstSpin.scene.overviewPose.height), "La cámara no volvió a la altura general");
assert(closeEnough(afterFirstSpin.scene.cameraPose.azimuth, overviewBeforeSpin.azimuth), "La ruleta perdió el ángulo elegido por el usuario");
const spinScreenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(spinScreenshotPath, Buffer.from(spinScreenshot.data, "base64"));
assert(await evaluate("window.__birthdayTest.dragCamera(-35)"), "La cámara no volvió a responder tras el giro");
const blockedByActiveRound = await evaluate("window.__birthdayTest.spin()");
assert(blockedByActiveRound === null, "La ruleta permitió saltarse una vela activa");

await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
await new Promise((resolve) => setTimeout(resolve, 150));
await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
assert(!(await state()).people[firstId].blown, "La barra espaciadora sigue apagando la vela");

const blowPoint = await evaluate(`(() => {
  const rect = document.getElementById("blow-btn").getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: blowPoint.x, y: blowPoint.y, button: "left", buttons: 1, clickCount: 1 });
await new Promise((resolve) => setTimeout(resolve, 60));
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: blowPoint.x, y: blowPoint.y, button: "left", buttons: 0, clickCount: 1 });
await new Promise((resolve) => setTimeout(resolve, 100));
const shortHoldState = await state();
assert(!shortHoldState.people[firstId].blown, "Una pulsación corta simuló el soplido");
assert(!shortHoldState.microphone.holding && shortHoldState.microphone.state === "closed", "El micrófono no se cerró al soltar");
assert(shortHoldState.microphone.threshold >= 0.45 && shortHoldState.microphone.threshold <= 0.55, "El umbral no está cerca de la mitad del máximo");
assert(shortHoldState.microphone.fallbackHoldMs === 120, "El modo alternativo de prueba no expone su retardo");

await send("Input.dispatchMouseEvent", { type: "mousePressed", x: blowPoint.x, y: blowPoint.y, button: "left", buttons: 1, clickCount: 1 });
await waitFor(async () => (await state()).people[firstId].blown, "Mantener pulsado el botón no apagó la vela");
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: blowPoint.x, y: blowPoint.y, button: "left", buttons: 0, clickCount: 1 });
assert(!(await state()).microphone.holding, "El botón quedó pulsado después de soltar");
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
    assert(biteState.nomSoundCount === nomBefore + bite, "Falta un único sonido ñam por mordisco");
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

// Comprobación responsive, órbita táctil y fallback de pulsación mantenida.
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
await new Promise((resolve) => setTimeout(resolve, 180));
const mobileScreenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(mobileScreenshotPath, Buffer.from(mobileScreenshot.data, "base64"));

const mobileAzimuthBefore = (await state()).scene.cameraPose.azimuth;
await send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: 125, y: 185, radiusX: 2, radiusY: 2, force: 1, id: 9 }],
});
await send("Input.dispatchTouchEvent", {
  type: "touchMove",
  touchPoints: [{ x: 245, y: 185, radiusX: 2, radiusY: 2, force: 1, id: 9 }],
});
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((resolve) => setTimeout(resolve, 60));
const mobileAzimuthAfter = (await state()).scene.cameraPose.azimuth;
assert(Math.abs(mobileAzimuthAfter - mobileAzimuthBefore) > 0.25, "El arrastre táctil no hizo orbitar la cámara");

await evaluate("document.getElementById('spin-btn').click()");
await waitFor(async () => (await state()).activeCandleId, "La ruleta móvil no eligió una vela");
const mobileBlowPoint = await evaluate(`(() => {
  const rect = document.getElementById("blow-btn").getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()`);
await send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: mobileBlowPoint.x, y: mobileBlowPoint.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
});
await new Promise((resolve) => setTimeout(resolve, 60));
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((resolve) => setTimeout(resolve, 90));
assert(!Object.values((await state()).people).some((person) => person.blown), "Un toque móvil corto apagó la vela");
await send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: mobileBlowPoint.x, y: mobileBlowPoint.y, radiusX: 2, radiusY: 2, force: 1, id: 2 }],
});
await waitFor(async () => Object.values((await state()).people).some((person) => person.blown), "La pulsación táctil mantenida no apagó la vela");
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await waitFor(async () => !(await state()).songPlaying, "El aviso móvil dejó la fiesta bloqueada");

// La ruta normal conserva una ruleta lenta y vuelve a la vista general antes de elegir.
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
assert(productionSpinElapsed >= 8200, `La ruleta de producción y su vuelta duraron solo ${Math.round(productionSpinElapsed)} ms`);
assert(productionSpinElapsed < 11000, "La ruleta de producción tardó demasiado en volver a la vista general");

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
  spinScreenshot: spinScreenshotPath,
  mobileScreenshot: mobileScreenshotPath,
  mobileViewport: mobileUi.viewport,
  browserErrors: errors,
  crawlSamples: crawlSamples.length,
  walkers: sceneState.walkers.length,
  npcTested: npcTarget.id,
  productionSpinMs: Math.round(productionSpinElapsed),
  detailPages: [geidoPage.name, carlosPage.name],
}, null, 2));

socket.close();
