// Motor 3D de la tarta (Three.js vía CDN, sin build step).
// Expone window.Cake3D.create({ canvas, people }) -> API de control.
// No conoce el estado de "soplada/comida": eso lo decide js/script.js,
// que es quien llama a estos métodos en el momento adecuado.

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const ANGLE_OFFSET = -45; // igual que la versión 2D: velas arriba/derecha/abajo/izquierda
const CAKE_RADIUS = 3.1;
const CAKE_HEIGHT = 1.15;
const CANDLE_RADIUS_RATIO = 0.58;
const CANDLE_STICK_H = 1.3;
const CANDLE_STICK_R = 0.1;
const SPONGE_COLOR = 0xe7b06b;
const SPIN_DURATION_MS = 3400;
const BLOW_ANIM_MS = 750;
const BITE_ANIM_MS = 700;

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function pointOnCircle(r, angleDeg) {
  const rad = degToRad(angleDeg);
  return { x: r * Math.sin(rad), z: r * Math.cos(rad) };
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,210,140,0.7)");
  grad.addColorStop(1, "rgba(255,150,60,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Textura de "mordisco": un hueco oscuro semicircular con marcas de dientes
// recortadas en el borde curvo (no busca ser realista, solo legible).
function createBiteTexture() {
  const size = 160;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size * 0.22;
  const r = size * 0.62;
  ctx.fillStyle = "rgba(35,20,12,0.88)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  const teeth = 6;
  for (let i = 0; i <= teeth; i++) {
    const a = Math.PI * (i / teeth);
    const tx = cx + r * Math.cos(a);
    const ty = cy + r * Math.sin(a);
    ctx.beginPath();
    ctx.arc(tx, ty, size * 0.075, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  return new THREE.CanvasTexture(canvas);
}

function buildSliceShape(radius, startDeg, endDeg) {
  const shape = new THREE.Shape();
  const segments = Math.max(8, Math.round((endDeg - startDeg) / 4));
  shape.moveTo(0, 0);
  for (let i = 0; i <= segments; i++) {
    const a = startDeg + (endDeg - startDeg) * (i / segments);
    const p = pointOnCircle(radius, a);
    shape.lineTo(p.x, -p.z);
  }
  shape.lineTo(0, 0);
  return shape;
}

export function createCake3D({ canvas, people }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const container = canvas.parentElement;
  const viewSize = 4.4;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const camDist = 9;
  camera.position.set(camDist, camDist * 0.92, camDist);
  camera.lookAt(0, CAKE_HEIGHT * 0.4, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const keyLight = new THREE.DirectionalLight(0xfff2d9, 0.9);
  keyLight.position.set(5, 8, 4);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xbcd4ff, 0.35);
  fillLight.position.set(-6, 4, -3);
  scene.add(fillLight);

  const shadowMesh = new THREE.Mesh(
    new THREE.CircleGeometry(CAKE_RADIUS * 1.18, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = -0.02;
  scene.add(shadowMesh);

  const cakeGroup = new THREE.Group();
  scene.add(cakeGroup);

  const n = people.length;
  const step = 360 / n;
  const glowTexture = createGlowTexture();
  const biteTexture = createBiteTexture();

  const slices = new Map();
  const candles = new Map();

  people.forEach((p, idx) => {
    const start = idx * step + ANGLE_OFFSET;
    const end = start + step;
    const shape = buildSliceShape(CAKE_RADIUS, start, end);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: CAKE_HEIGHT, bevelEnabled: false, curveSegments: 1 });
    // ExtrudeGeometry asigna materialIndex 0 a las tapas (arriba/abajo) y
    // materialIndex 1 a las caras laterales -> [glaseado, bizcocho].
    const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color), roughness: 0.6, transparent: true });
    const sideMat = new THREE.MeshStandardMaterial({ color: SPONGE_COLOR, roughness: 0.9, transparent: true });
    const mesh = new THREE.Mesh(geo, [capMat, sideMat]);
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData = { id: p.id };
    cakeGroup.add(mesh);
    slices.set(p.id, { mesh, capMat, sideMat, angleMid: start + step / 2, removed: false });

    const edge = pointOnCircle(CAKE_RADIUS, start);
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, CAKE_HEIGHT + 0.005, 0),
      new THREE.Vector3(edge.x, CAKE_HEIGHT + 0.005, edge.z),
    ]);
    cakeGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })));
  });

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(CAKE_RADIUS, 0.055, 10, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = CAKE_HEIGHT;
  cakeGroup.add(rim);

  people.forEach((p, idx) => {
    const mid = idx * step + step / 2 + ANGLE_OFFSET;
    const pos = pointOnCircle(CAKE_RADIUS * CANDLE_RADIUS_RATIO, mid);
    const group = new THREE.Group();
    group.position.set(pos.x, CAKE_HEIGHT, pos.z);
    cakeGroup.add(group);

    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(CANDLE_STICK_R, CANDLE_STICK_R, CANDLE_STICK_H, 14),
      new THREE.MeshStandardMaterial({ color: p.color })
    );
    stick.position.y = CANDLE_STICK_H / 2;
    group.add(stick);

    [0.32, 0.68].forEach((f) => {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(CANDLE_STICK_R * 1.05, CANDLE_STICK_R * 1.05, CANDLE_STICK_H * 0.1, 14),
        new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      band.position.y = CANDLE_STICK_H * f;
      group.add(band);
    });

    const wick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2b21 })
    );
    wick.position.y = CANDLE_STICK_H + 0.08;
    group.add(wick);

    const flameGroup = new THREE.Group();
    flameGroup.position.y = CANDLE_STICK_H + 0.18;
    group.add(flameGroup);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6a1a, emissiveIntensity: 1.2, transparent: true })
    );
    flame.position.y = 0.15;
    flameGroup.add(flame);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color: 0xffcf88, transparent: true, opacity: 0.5, depthWrite: false })
    );
    glow.scale.set(0.55, 0.55, 1);
    glow.position.y = 0.12;
    flameGroup.add(glow);

    const light = new THREE.PointLight(0xffb066, 0.55, 2.4, 2);
    light.position.y = 0.18;
    flameGroup.add(light);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.34, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.015;
    group.add(ring);

    candles.set(p.id, { group, flameGroup, flame, glow, light, ring, angleMid: mid, blownOut: false, seed: Math.random() * 10 });
  });

  let baseRotationY = 0;
  let spinning = false;
  let armedId = null;
  let interactive = false;
  const sliceClickListeners = [];
  const puffs = [];
  const activeTweens = [];
  const clock = new THREE.Clock();

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.left = -viewSize * aspect;
    camera.right = viewSize * aspect;
    camera.top = viewSize;
    camera.bottom = -viewSize;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function addTween({ duration, ease = easeOutCubic, onUpdate, onComplete }) {
    return new Promise((resolve) => {
      activeTweens.push({
        start: performance.now(),
        duration,
        ease,
        onUpdate,
        onComplete: () => {
          if (onComplete) onComplete();
          resolve();
        },
      });
    });
  }

  function spawnPuffsAt(worldPos) {
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.8 })
      );
      mesh.position.copy(worldPos);
      mesh.position.x += (Math.random() - 0.5) * 0.15;
      mesh.position.z += (Math.random() - 0.5) * 0.15;
      scene.add(mesh);
      puffs.push({ mesh, life: 0, duration: 0.9 + Math.random() * 0.3, drift: (Math.random() - 0.5) * 0.4 });
    }
  }

  function animate() {
    const t = clock.getElapsedTime();
    const dt = clock.getDelta();

    candles.forEach((c, id) => {
      if (!c.blownOut) {
        const s = 1 + 0.06 * Math.sin(t * 9 + c.seed);
        c.flameGroup.scale.set(s, 1 + 0.09 * Math.cos(t * 7.5 + c.seed), s);
        c.flameGroup.rotation.z = 0.06 * Math.sin(t * 5 + c.seed);
        c.glow.material.opacity = 0.42 + 0.12 * Math.sin(t * 6 + c.seed);
      }
      if (id === armedId) {
        c.ring.material.opacity = 0.3 + 0.28 * Math.sin(t * 4.2);
      } else if (c.ring.material.opacity > 0) {
        c.ring.material.opacity = Math.max(0, c.ring.material.opacity - dt * 2);
      }
    });

    if (!spinning) {
      cakeGroup.rotation.y = baseRotationY + 0.055 * Math.sin(t * 0.65);
    }

    for (let i = puffs.length - 1; i >= 0; i--) {
      const puff = puffs[i];
      puff.life += dt;
      const k = puff.life / puff.duration;
      if (k >= 1) {
        scene.remove(puff.mesh);
        puffs.splice(i, 1);
        continue;
      }
      puff.mesh.position.y += dt * 0.9;
      puff.mesh.position.x += puff.drift * dt;
      puff.mesh.scale.setScalar(1 + k * 1.6);
      puff.mesh.material.opacity = 0.75 * (1 - k);
    }

    for (let i = activeTweens.length - 1; i >= 0; i--) {
      const tw = activeTweens[i];
      const p = Math.min(1, (performance.now() - tw.start) / tw.duration);
      tw.onUpdate(tw.ease(p));
      if (p >= 1) {
        activeTweens.splice(i, 1);
        tw.onComplete();
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  function spinToRandom(excludeIds) {
    if (spinning) return Promise.resolve(null);
    const candidates = people.filter((p) => !excludeIds.includes(p.id));
    if (candidates.length === 0) return Promise.resolve(null);

    spinning = true;
    armedId = null;

    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const candleInfo = candles.get(target.id);
    const localRad = degToRad(candleInfo.angleMid);
    const camAzimuth = Math.atan2(camera.position.x, camera.position.z);
    const targetBase = camAzimuth - localRad;

    const current = cakeGroup.rotation.y;
    const delta = ((targetBase - current) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const extraTurns = 4 + Math.floor(Math.random() * 3);
    const finalRotation = current + delta + extraTurns * Math.PI * 2;

    return addTween({
      duration: SPIN_DURATION_MS,
      ease: easeInOutCubic,
      onUpdate: (k) => {
        cakeGroup.rotation.y = current + (finalRotation - current) * k;
      },
      onComplete: () => {
        baseRotationY = finalRotation % (Math.PI * 2);
        cakeGroup.rotation.y = baseRotationY;
        spinning = false;
        armedId = target.id;
      },
    }).then(() => target.id);
  }

  function clearArmedHighlight() {
    armedId = null;
  }

  function blowOutCandle(id) {
    const c = candles.get(id);
    if (!c || c.blownOut) return Promise.resolve();
    c.blownOut = true;
    if (armedId === id) armedId = null;

    const worldPos = new THREE.Vector3();
    c.flameGroup.getWorldPosition(worldPos);
    spawnPuffsAt(worldPos);

    return addTween({
      duration: BLOW_ANIM_MS,
      ease: easeOutQuad,
      onUpdate: (k) => {
        c.flame.scale.setScalar(Math.max(0, 1 - k * 1.3));
        c.flame.material.opacity = 1 - k;
        c.glow.material.opacity = 0.5 * (1 - k);
        c.light.intensity = 0.55 * (1 - k);
      },
      onComplete: () => {
        c.flameGroup.visible = false;
      },
    });
  }

  function biteSlice(id) {
    const s = slices.get(id);
    if (!s || s.removed) return Promise.resolve();

    const edge = pointOnCircle(CAKE_RADIUS * 0.92, s.angleMid);
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 1.3),
      new THREE.MeshBasicMaterial({ map: biteTexture, transparent: true, depthWrite: false })
    );
    decal.position.set(edge.x, CAKE_HEIGHT + 0.02, edge.z);
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = -degToRad(s.angleMid);
    decal.scale.setScalar(0.001);
    cakeGroup.add(decal);

    return addTween({
      duration: 220,
      ease: easeOutCubic,
      onUpdate: (k) => decal.scale.setScalar(0.001 + k * 0.999),
    })
      .then(
        () =>
          addTween({
            duration: 160,
            ease: (k) => k,
            onUpdate: (k) => {
              s.mesh.rotation.z = Math.sin(k * Math.PI * 4) * 0.03;
            },
          })
      )
      .then(() =>
        addTween({
          duration: BITE_ANIM_MS,
          ease: easeOutCubic,
          onUpdate: (k) => {
            const sc = 1 - k * 0.85;
            s.mesh.scale.set(sc, 1 - k * 0.7, sc);
            s.mesh.position.y = -k * 0.6;
            s.capMat.opacity = 1 - k;
            s.sideMat.opacity = 1 - k;
          },
          onComplete: () => {
            s.mesh.visible = false;
            s.removed = true;
            cakeGroup.remove(decal);
          },
        })
      );
  }

  function setSlicesInteractive(v) {
    interactive = v;
  }

  function onSliceClick(cb) {
    sliceClickListeners.push(cb);
  }

  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();

  function handlePointer(ev) {
    if (!interactive) return;
    const rect = canvas.getBoundingClientRect();
    pointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const meshes = [...slices.values()].filter((s) => !s.removed).map((s) => s.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.id;
      sliceClickListeners.forEach((cb) => cb(id));
    }
  }
  canvas.addEventListener("pointerdown", handlePointer);

  return {
    spinToRandom,
    clearArmedHighlight,
    blowOutCandle,
    biteSlice,
    setSlicesInteractive,
    onSliceClick,
    dispose() {
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", handlePointer);
    },
  };
}

window.Cake3D = { create: createCake3D };
