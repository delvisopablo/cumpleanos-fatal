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
const hungrymanPageUrlObject = new URL("personas/hungryman.html", siteUrl);
hungrymanPageUrlObject.searchParams.set("routeTest", String(runId));
const hungrymanPageUrl = hungrymanPageUrlObject.href;
const carlosPageUrlObject = new URL("personas/carlos-conde.html", siteUrl);
carlosPageUrlObject.searchParams.set("routeTest", String(runId));
const carlosPageUrl = carlosPageUrlObject.href;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function closeEnough(first, second, tolerance = 0.03) {
  return Math.abs(first - second) <= tolerance;
}

function angleDistance(first, second) {
  const tau = Math.PI * 2;
  return Math.abs(((second - first + Math.PI) % tau + tau) % tau - Math.PI);
}

function signedAngleDelta(first, second) {
  const tau = Math.PI * 2;
  return ((second - first + Math.PI) % tau + tau) % tau - Math.PI;
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
    const optionalAsset = /\/assets\/(audio|lyrics|song-photos|comics|sfx)\//.test(entry.url || entry.text);
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
    groupComicKeys: Object.keys(CONFIG.groupComic || {}).sort(),
  };
})()`);
assert(initialUi.textLength > 80, "La página se ha renderizado vacía");
assert(initialUi.fallbackHidden, "Se mostró el fallback en vez de la escena 3D");
assert(initialUi.canvas.width >= 1000 && initialUi.canvas.height >= 700, "El canvas no ocupa la escena");
assert(initialUi.dockBottom === 800, "La barra de personas no está fijada abajo");
assert(initialUi.chipCount === 4, "No aparecen las cuatro personas");
assert(initialUi.chipNames[0] === "Hungryman", "El nombre de Hungryman no aparece en la mesa");
assert(initialUi.firstLink === "personas/hungryman.html", "La página individual de Hungryman no está enlazada");
assert(initialUi.description.includes("Hungryman"), "Los metadatos principales no incluyen a Hungryman");
assert(initialUi.socialImage.endsWith("/public/og-v2.png"), "La tarjeta social nueva no está enlazada");
assert(!initialUi.buttonDisabled, "La ruleta empieza bloqueada");
const expectedConfigKeys = ["audio", "color", "comics", "id", "lyrics", "name", "songPhotos"];
assert(
  initialUi.configKeys.every((keys) => JSON.stringify(keys) === JSON.stringify(expectedConfigKeys)),
  "config.js no conserva exactamente {id,name,color,audio,lyrics,songPhotos,comics}"
);
assert(
  JSON.stringify(initialUi.configNames) === JSON.stringify(["Hungryman", "Dientes", "Carlos", "Daviles"]),
  "Los nombres de las cuatro personas no son los esperados"
);
assert(JSON.stringify(initialUi.groupComicKeys) === JSON.stringify(["comics"]), "Falta CONFIG.groupComic.comics");

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
assert(
  sceneState.placeSettings.filter((setting) => setting.drinkType === "beer").every((setting) => (
    setting.liquidProfile.kind === "beer" && setting.liquidProfile.fillRatio >= 0.75 &&
    setting.liquidProfile.fillHeight >= 0.65 && setting.liquidProfile.opacity === 1
  )),
  "La cerveza no tiene un cuerpo ámbar opaco bajo la espuma"
);
assert(
  sceneState.placeSettings.filter((setting) => setting.drinkType === "wine").every((setting) => (
    setting.liquidProfile.kind === "wine" && setting.liquidProfile.fillRatio >= 0.5 &&
    setting.liquidProfile.fillHeight >= 0.3 && setting.liquidProfile.opacity === 1
  )),
  "La copa de vino no tiene un relleno burdeos visible"
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
assert(sceneState.seatedPeople.length === 4, "No hay un monigote sentado por persona");
assert(
  JSON.stringify(sceneState.seatedPeople.map((person) => person.id)) ===
    JSON.stringify(["hungryman", "dientes", "carlos", "daviles"]),
  "Los cuatro monigotes no corresponden a las personas configuradas"
);
assert(sceneState.seatedPeople.every((person) => person.facingCakeDot > 0.995), "Algún monigote no mira hacia la tarta");
assert(sceneState.seatedPeople.every((person) => (
  Math.hypot(person.position.x - person.chairPosition.x, person.position.z - person.chairPosition.z) < 0.25
)), "Algún monigote no está colocado en su silla");
const seatedById = Object.fromEntries(sceneState.seatedPeople.map((person) => [person.id, person]));
assert(
  seatedById.hungryman.scale > Math.max(seatedById.dientes.scale, seatedById.daviles.scale) * 1.15 &&
    seatedById.hungryman.scale < Math.max(seatedById.dientes.scale, seatedById.daviles.scale) * 1.4,
  "Hungryman no conserva un tamaño grande pero proporcionado"
);
assert(seatedById.carlos.scale >= 1 && seatedById.carlos.scale < Math.min(seatedById.dientes.scale, seatedById.daviles.scale), "Carlos no tiene un tamaño legible y sigue siendo el más pequeño");
assert(sceneState.seatedPeople.every((person) => person.headRadiusWorld >= 0.44), "Alguna cabeza sigue siendo demasiado pequeña para apreciar sus rasgos");
assert(["largest", "bald", "long-black-beard"].every((trait) => seatedById.hungryman.traits.includes(trait)), "Falta la pinta de Hungryman");
assert(["round-glasses", "thin-moustache", "neck-length-thick-hair"].every((trait) => seatedById.dientes.traits.includes(trait)), "Falta la pinta de Dientes");
assert(["full-beard", "short-hair", "pharmacist-coat", "orange-cat"].every((trait) => seatedById.daviles.traits.includes(trait)), "Falta la pinta de Daviles");
assert(["trimmed-beard", "small-glasses", "neat-fringe"].every((trait) => seatedById.carlos.traits.includes(trait)), "Falta la pinta de Carlos");
assert(!loadedState.groupComic.unlocked && !loadedState.groupComic.buttonVisible, "El cómic final aparece antes de ver los individuales");
assert(await evaluate("window.__birthdayTest.openGroupComic()") === false, "El cómic final se puede abrir antes de desbloquearlo");
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

// Primera ronda: aceleración inicial, frenado progresivo, alineación exacta y plano sobre el hombro.
await evaluate("document.getElementById('spin-btn').click()");
const dragDuringAutomaticMove = await evaluate("window.__birthdayTest.dragCamera(80)");
assert(dragDuringAutomaticMove === false, "El arrastre interrumpió el movimiento automático de cámara");
const firstId = await waitFor(async () => (await state()).activeCandleId, "La ruleta no eligió una vela");
const afterFirstSpin = await state();
assert(afterFirstSpin.scene.maxCameraFocus > 0.9, "La cámara no se acercó durante la ruleta");
assert(afterFirstSpin.scene.cameraMode === "shoulder", "La cámara no terminó en el plano sobre el hombro");
assert(afterFirstSpin.scene.focusedPersonId === firstId, "La cámara no se colocó detrás de la persona elegida");
assert(afterFirstSpin.scene.lastAlignment?.id === firstId, "La alineación no pertenece a la persona elegida");
assert(afterFirstSpin.scene.lastAlignment.error < 1e-7, "La porción elegida no apunta exactamente a su persona");
const selectedSetting = afterFirstSpin.scene.placeSettings.find((setting) => setting.id === firstId);
const selectedPerson = afterFirstSpin.scene.seatedPeople.find((person) => person.id === firstId);
const selectedChairRadius = Math.hypot(selectedSetting.chairPosition.x, selectedSetting.chairPosition.z);
assert(afterFirstSpin.scene.cameraPose.radius > selectedChairRadius + 3.5, "La cámara sigue demasiado pegada a la silla");
assert(
  afterFirstSpin.scene.cameraPose.height > selectedPerson.headWorldY + selectedPerson.headRadiusWorld + 1.2,
  "La cámara no está suficientemente elevada sobre la cabeza"
);
const leftShoulderOffset = signedAngleDelta(selectedSetting.seatAzimuth, afterFirstSpin.scene.cameraPose.azimuth);
assert(leftShoulderOffset >= 0.19 && leftShoulderOffset <= 0.26, "La cámara no queda sobre el hombro izquierdo");
assert(afterFirstSpin.scene.cakeScreenPosition.visible, "La tarta queda fuera del encuadre de soplido");
assert(afterFirstSpin.scene.candleScreenPositions.every((candle) => candle.visible), "Alguna vela queda fuera del encuadre de soplido");
assert(selectedPerson.headViewportFraction < 0.24, "La cabeza elegida sigue tapando demasiado la pantalla");
const spinTrace = afterFirstSpin.scene.lastSpinTrace;
assert(spinTrace.length >= 8, "No hay suficientes muestras para comprobar el frenado de la ruleta");
const spinSpeeds = spinTrace.slice(1).map((sample, index) => {
  const previous = spinTrace[index];
  return Math.abs(sample.rotation - previous.rotation) / (sample.progress - previous.progress);
});
assert(spinSpeeds[0] > spinSpeeds.at(-1) * 8, "La ruleta no empieza mucho más rápido de lo que termina");
assert(
  spinSpeeds.slice(1).every((speed, index) => speed <= spinSpeeds[index] * 1.03),
  "La ruleta no decelera de forma progresiva"
);
const spinScreenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
await writeFile(spinScreenshotPath, Buffer.from(spinScreenshot.data, "base64"));
const shoulderAzimuth = afterFirstSpin.scene.cameraPose.azimuth;
assert(await evaluate("window.__birthdayTest.dragCamera(-60)"), "La cámara no volvió a responder tras el giro");
const afterShoulderDrag = await state();
assert(angleDistance(afterShoulderDrag.scene.cameraPose.azimuth, shoulderAzimuth) > 0.3, "La cámara no orbitó desde el plano sobre el hombro");
assert(afterShoulderDrag.scene.cameraMode === "free", "La cámara no pasó a control libre tras arrastrar");
assert(afterShoulderDrag.activeCandleId === firstId, "Girar la cámara cambió la vela activa");
const postSpinNpc = afterShoulderDrag.scene.walkers.find((walker) => walker.screenPosition.visible);
assert(postSpinNpc, "No queda ningún NPC accesible desde la cámara libre");
const postSpinTalk = await evaluate(`window.__birthdayTest.talkToNpc(${JSON.stringify(postSpinNpc.id)})`);
assert(postSpinTalk?.speaking, "Los NPC dejaron de responder después del plano sobre el hombro");
await evaluate(`window.__birthdayTest.talkToNpc(${JSON.stringify(postSpinNpc.id)})`);
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
  const roundState = await state();
  assert(roundState.scene.cameraMode === "shoulder" && roundState.scene.focusedPersonId === selectedId, "La cámara no siguió a la persona de la nueva ronda");
  assert(roundState.scene.lastAlignment?.id === selectedId && roundState.scene.lastAlignment.error < 1e-7, "Una porción posterior no quedó alineada con su persona");
  const roundSpeeds = roundState.scene.lastSpinTrace.slice(1).map((sample, index) => {
    const previous = roundState.scene.lastSpinTrace[index];
    return Math.abs(sample.rotation - previous.rotation) / (sample.progress - previous.progress);
  });
  assert(roundSpeeds[0] > roundSpeeds.at(-1) * 8, "Una tirada posterior no frenó progresivamente");

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
assert(afterCandles.biteAudio.path === "assets/sfx/comer.mp3", "El mordisco no apunta a assets/sfx/comer.mp3");
assert(afterCandles.biteAudio.defaultDurationMs === 1000, "El fallback de mordisco no dura un segundo en producción");
assert(await evaluate("window.__birthdayTest.setBiteAudioDuration(260)"), "No se pudo simular la duración real del audio");

// Cada clic elimina exactamente un triángulo; el individual aparece al cuarto y el final, tras ver los cuatro.
assert(!afterCandles.groupComic.unlocked && !afterCandles.groupComic.buttonVisible, "El cómic final se desbloqueó solo al apagar velas");
let completedComics = 0;
let synchronizedBiteChecked = false;
for (const personId of chosenIds) {
  const nomBefore = (await state()).nomSoundCount;
  for (let bite = 1; bite <= 4; bite++) {
    const biteStartedAt = performance.now();
    const result = await evaluate(`window.__birthdayTest.bite(${JSON.stringify(personId)})`);
    const biteWallTime = performance.now() - biteStartedAt;
    const biteState = await state();
    assert(result.bites === bite, `El mordisco ${bite} no actualizó la porción`);
    assert(biteState.people[personId].bites === bite, "El estado y la geometría de mordiscos no coinciden");
    assert(biteState.nomSoundCount === nomBefore + bite, "Falta un único sonido de comer por mordisco");
    if (!synchronizedBiteChecked) {
      assert(result.animationDurationMs === 260, "La geometría no recibió la duración leída del audio");
      assert(biteState.biteAudio.lastTiming.requestedDurationMs === 260, "El controlador no conserva la duración del audio");
      assert(biteState.scene.biteAnimation.lastDurationMs === 260, "La animación no usa la duración real del sonido");
      assert(biteWallTime >= 230 && biteWallTime < 650, `El mordisco duró ${Math.round(biteWallTime)} ms en vez de unos 260 ms`);
      assert(Math.abs(biteState.scene.biteAnimation.lastElapsedMs - 260) < 90, "El tiempo real de animación no coincide con el audio");
      synchronizedBiteChecked = true;
      await evaluate("window.__birthdayTest.setBiteAudioDuration(55)");
    }
    if (bite < 4) {
      assert(!biteState.people[personId].eaten, "La porción desapareció antes del cuarto mordisco");
      assert(!biteState.modalOpen, "El cómic se abrió antes de terminar la porción");
    } else {
      assert(biteState.people[personId].eaten, "La porción no terminó tras cuatro mordiscos");
      assert(biteState.modalOpen, "El cómic no se abrió al terminar la porción");
      assert(biteState.modalKind === "individual", "Se abrió un modal distinto al cómic individual");
      completedComics += 1;
      assert(
        biteState.groupComic.unlocked === (completedComics === 4) &&
          biteState.groupComic.buttonVisible === (completedComics === 4),
        "El cómic final no respeta el desbloqueo tras los cuatro individuales"
      );
      await evaluate("window.__birthdayTest.closeComic()");
    }
  }
}

const finalState = await state();
assert(Object.values(finalState.people).every((person) => person.eaten), "No se completaron las cuatro porciones");
assert(finalState.nomSoundCount === 16, "El total de sonidos de comer no coincide con los mordiscos");
assert(finalState.biteAudio.fallbackCount === 16, "El fallback de prueba no sonó una vez por mordisco");
assert(new Set(finalState.viewedComicIds).size === 4, "No constan como vistos los cuatro cómics individuales");
assert(finalState.groupComic.unlocked && finalState.groupComic.buttonVisible, "El botón del cómic final no apareció");
await evaluate("document.getElementById('group-comic-btn').click()");
const groupComicState = await state();
const groupPlaceholder = await evaluate("document.getElementById('modal-gallery').innerText");
assert(groupComicState.modalOpen && groupComicState.modalKind === "group", "El botón no abre el cómic final");
assert(groupPlaceholder.includes("cómic final de los cuatro"), "Falta el aviso amistoso del cómic grupal vacío");
assert(groupPlaceholder.includes("assets/comics/group/"), "El aviso grupal no indica la carpeta correcta");
await evaluate("window.__birthdayTest.closeComic()");

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
const mobileSpinState = await state();
assert(mobileSpinState.scene.cameraMode === "shoulder", "La cámara móvil no llegó al plano sobre el hombro");
assert(mobileSpinState.scene.focusedPersonId === mobileSpinState.activeCandleId, "La cámara móvil enfocó a otra persona");
assert(mobileSpinState.scene.lastAlignment.error < 1e-7, "La porción móvil no quedó alineada");
const mobileShoulderAzimuth = mobileSpinState.scene.cameraPose.azimuth;
assert(await evaluate("window.__birthdayTest.dragCamera(55)"), "La cámara móvil no responde después de la tirada");
assert(angleDistance((await state()).scene.cameraPose.azimuth, mobileShoulderAzimuth) > 0.25, "No se puede mirar alrededor tras la tirada móvil");
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

// La ruta normal conserva una ruleta lenta y termina en el plano sobre el hombro.
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
assert(productionSpinElapsed >= 8500, `La ruleta de producción y la cámara duraron solo ${Math.round(productionSpinElapsed)} ms`);
assert(productionSpinElapsed < 11000, "La ruleta de producción tardó demasiado en llegar al plano sobre el hombro");

await send("Page.navigate", { url: hungrymanPageUrl });
await waitFor(
  () => evaluate(`${JSON.stringify(hungrymanPageUrl)} === location.href && document.body.dataset.personId === "hungryman"`),
  "La página individual de Hungryman no cargó"
);
const hungrymanPage = await evaluate(`({
  title: document.title,
  name: document.getElementById("person-name")?.textContent,
  songButton: document.getElementById("play-song")?.textContent,
  description: document.querySelector('meta[name="description"]')?.content,
})`);
assert(hungrymanPage.title.startsWith("Hungryman"), "El título individual de Hungryman es incorrecto");
assert(hungrymanPage.name === "Hungryman", "La página individual no muestra el nombre de Hungryman");
assert(hungrymanPage.songButton.includes("canción"), "La página individual de Hungryman no conserva su canción");
assert(hungrymanPage.description.includes("Hungryman"), "La descripción individual de Hungryman es incorrecta");

await send("Page.navigate", { url: carlosPageUrl });
await waitFor(
  () => evaluate(`${JSON.stringify(carlosPageUrl)} === location.href && document.body.dataset.personId === "carlos"`),
  "La página individual de Carlos no cargó"
);
const carlosPage = await evaluate(`({
  title: document.title,
  name: document.getElementById("person-name")?.textContent,
})`);
assert(carlosPage.title.startsWith("Carlos ·"), "La ruta representativa de Carlos perdió sus metadatos");
assert(carlosPage.name === "Carlos", "La ruta representativa de Carlos perdió su contenido");

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
  seatedPeople: sceneState.seatedPeople.map((person) => ({ id: person.id, scale: person.scale, traits: person.traits })),
  npcTested: npcTarget.id,
  productionSpinMs: Math.round(productionSpinElapsed),
  groupComicUnlocked: finalState.groupComic.unlocked,
  biteAudio: finalState.biteAudio,
  detailPages: [hungrymanPage.name, carlosPage.name],
}, null, 2));

socket.close();
