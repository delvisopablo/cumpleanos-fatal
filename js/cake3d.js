/* global THREE */

// Escena 3D completa. Se mantiene como script clásico para que index.html
// también funcione al abrirlo directamente, sin compilación ni backend.
(function (global) {
  "use strict";

  if (!global.THREE) {
    global.Cake3D = null;
    return;
  }

  const TEST_MODE = new URLSearchParams(global.location.search).has("test");
  const REDUCED_MOTION = global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ANGLE_OFFSET = -45;
  const TABLE_SURFACE_Y = 1.62;
  const CAKE_WIDTH = 6.4;
  const CAKE_DEPTH = 5.2;
  const CAKE_HEIGHT = 1.16;
  const CANDLE_HEIGHT = 1.28;
  const BITE_STEPS = 4;
  const PRODUCTION_SPIN_DURATION_MS = 7600;
  const SPIN_DURATION_MS = TEST_MODE ? 420 : REDUCED_MOTION ? 1500 : PRODUCTION_SPIN_DURATION_MS;
  const CAMERA_RESET_MS = TEST_MODE ? 80 : REDUCED_MOTION ? 220 : 900;
  const CAMERA_SHOULDER_MS = TEST_MODE ? 120 : REDUCED_MOTION ? 260 : 1100;
  const BLOW_DURATION_MS = TEST_MODE ? 40 : 680;
  const DEFAULT_BITE_DURATION_MS = 1000;
  const TAU = Math.PI * 2;

  function degToRad(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function pointOnCircle(radius, angleDeg) {
    const angle = degToRad(angleDeg);
    return { x: radius * Math.sin(angle), z: radius * Math.cos(angle) };
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function rouletteEase(t) {
    return 1 - Math.pow(1 - t, 4.4);
  }

  function shortestAngleDelta(from, to) {
    return ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
  }

  function setShadow(mesh, cast, receive) {
    mesh.castShadow = Boolean(cast);
    mesh.receiveShadow = Boolean(receive);
    return mesh;
  }

  function createCheckerTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    const cell = 64;

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        context.fillStyle = (x + y) % 2 === 0 ? "#fff0d8" : "#c83c58";
        context.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    context.strokeStyle = "rgba(120, 28, 48, 0.18)";
    context.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      context.beginPath();
      context.moveTo(i * cell, 0);
      context.lineTo(i * cell, 256);
      context.stroke();
      context.beginPath();
      context.moveTo(0, i * cell);
      context.lineTo(256, i * cell);
      context.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(6.8, 4.8);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function createGlowTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,211,125,0.78)");
    gradient.addColorStop(1, "rgba(255,135,40,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  function roundedRectangle(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function createNameSprite(label, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 176;
    const context = canvas.getContext("2d");

    roundedRectangle(context, 12, 12, 616, 152, 34);
    context.fillStyle = "rgba(255,250,238,0.96)";
    context.fill();
    context.lineWidth = 10;
    context.strokeStyle = color;
    context.stroke();

    context.fillStyle = "#33231f";
    context.font = "800 54px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, 320, 90, 540);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.25, 0.62, 1);
    return sprite;
  }

  function buildTriangleShape(points) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0].x, -points[0].z);
    shape.lineTo(points[1].x, -points[1].z);
    shape.lineTo(points[2].x, -points[2].z);
    shape.closePath();
    return shape;
  }

  function createChair(person, direction) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6f3e28, roughness: 0.82 });
    const cushion = new THREE.MeshStandardMaterial({ color: new THREE.Color(person.color), roughness: 0.7 });

    const seat = setShadow(new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.22, 1.35), cushion), true, true);
    seat.position.y = 0.78;
    group.add(seat);

    const back = setShadow(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.55, 0.2), wood), true, true);
    back.position.set(0, 1.48, 0.57);
    group.add(back);

    const slat = setShadow(new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.64, 0.12), cushion), true, true);
    slat.position.set(0, 1.55, 0.43);
    group.add(slat);

    [[-0.57, -0.48], [0.57, -0.48], [-0.57, 0.48], [0.57, 0.48]].forEach(([x, z]) => {
      const leg = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.82, 0.14), wood), true, true);
      leg.position.set(x, 0.38, z);
      group.add(leg);
    });

    group.rotation.y = Math.atan2(direction.x, direction.z);
    return group;
  }

  function createPlate(person) {
    const group = new THREE.Group();
    const plate = setShadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.76, 0.08, 40),
        new THREE.MeshStandardMaterial({ color: 0xfffbef, roughness: 0.28, metalness: 0.02 })
      ),
      true,
      true
    );
    group.add(plate);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.59, 0.045, 10, 42),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(person.color), roughness: 0.35 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.075;
    group.add(rim);
    return group;
  }

  function createSpoon() {
    const group = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xcbd0d7, metalness: 0.8, roughness: 0.22 });
    const handle = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.045, 0.92), metal), true, true);
    group.add(handle);
    const bowl = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10), metal), true, true);
    bowl.scale.set(0.72, 0.25, 1);
    bowl.position.z = -0.52;
    group.add(bowl);
    return group;
  }

  function createBeer() {
    const group = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xe9f4ff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.08,
      transmission: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const amber = new THREE.MeshStandardMaterial({
      color: 0xe9981d,
      emissive: 0x351500,
      emissiveIntensity: 0.22,
      roughness: 0.28,
    });
    const foam = new THREE.MeshStandardMaterial({ color: 0xfff7dc, roughness: 0.9 });

    const drink = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.235, 0.68, 28), amber), true, true);
    drink.position.y = 0.39;
    drink.renderOrder = 1;
    group.add(drink);

    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.28, 0.86, 28, 1, true), glass);
    outer.position.y = 0.43;
    outer.renderOrder = 2;
    group.add(outer);

    const foamTop = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.12, 28), foam);
    foamTop.position.y = 0.765;
    foamTop.renderOrder = 3;
    group.add(foamTop);

    const beerTop = new THREE.Mesh(new THREE.CircleGeometry(0.265, 28), amber);
    beerTop.rotation.x = -Math.PI / 2;
    beerTop.position.y = 0.731;
    beerTop.renderOrder = 1;
    group.add(beerTop);

    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.055, 10, 24, Math.PI * 1.5), glass);
    handle.rotation.y = Math.PI / 2;
    handle.position.set(0.28, 0.47, 0);
    handle.renderOrder = 2;
    group.add(handle);
    group.userData.liquidProfile = {
      kind: "beer",
      color: "#e9981d",
      fillHeight: 0.68,
      fillRatio: 0.79,
      opacity: 1,
    };
    return group;
  }

  function createWine() {
    const group = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xf0f6ff,
      transparent: true,
      opacity: 0.2,
      roughness: 0.05,
      transmission: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const wine = new THREE.MeshStandardMaterial({
      color: 0x8e1834,
      emissive: 0x26030d,
      emissiveIntensity: 0.2,
      roughness: 0.28,
    });

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.15, 0.62, 30, 1, true), glass);
    bowl.position.y = 0.78;
    bowl.renderOrder = 2;
    group.add(bowl);

    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.18, 0.34, 30), wine);
    liquid.position.y = 0.66;
    liquid.renderOrder = 1;
    group.add(liquid);

    const wineTop = new THREE.Mesh(new THREE.CircleGeometry(0.285, 30), wine);
    wineTop.rotation.x = -Math.PI / 2;
    wineTop.position.y = 0.833;
    wineTop.renderOrder = 1;
    group.add(wineTop);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.48, 12), glass);
    stem.position.y = 0.28;
    group.add(stem);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.045, 28), glass);
    base.position.y = 0.03;
    group.add(base);
    group.userData.liquidProfile = {
      kind: "wine",
      color: "#8e1834",
      fillHeight: 0.34,
      fillRatio: 0.55,
      opacity: 1,
    };
    return group;
  }

  function createPlaceSetting(person, index, angleMid) {
    const directionPoint = pointOnCircle(1, angleMid);
    const direction = new THREE.Vector3(directionPoint.x, 0, directionPoint.z).normalize();
    const sideSeat = Math.abs(direction.x) > 0.5;
    const chairPosition = sideSeat
      ? new THREE.Vector3(Math.sign(direction.x) * 7.55, 0, 0)
      : new THREE.Vector3(0, 0, Math.sign(direction.z) * 5.55);
    const platePosition = sideSeat
      ? new THREE.Vector3(Math.sign(direction.x) * 5.02, TABLE_SURFACE_Y + 0.1, 0)
      : new THREE.Vector3(0, TABLE_SURFACE_Y + 0.1, Math.sign(direction.z) * 3.9);

    const chair = createChair(person, direction);
    chair.position.copy(chairPosition);

    const group = new THREE.Group();
    const plate = createPlate(person);
    plate.position.copy(platePosition);
    group.add(plate);

    const tangent = new THREE.Vector3(-direction.z, 0, direction.x);
    const spoon = createSpoon();
    spoon.position.copy(platePosition).addScaledVector(tangent, -0.95);
    spoon.position.y += 0.06;
    spoon.rotation.y = Math.atan2(direction.x, direction.z);
    group.add(spoon);

    const drinkType = person.drink || (index % 2 === 0 ? "beer" : "wine");
    const drink = drinkType === "wine" ? createWine() : createBeer();
    drink.position.copy(platePosition).addScaledVector(tangent, 0.92).addScaledVector(direction, -0.12);
    drink.position.y = TABLE_SURFACE_Y + 0.13;
    group.add(drink);

    const displayName = person.displayName || person.name;
    const card = createNameSprite(displayName, person.color);
    card.position.copy(platePosition).addScaledVector(direction, 0.78);
    card.position.y = TABLE_SURFACE_Y + 0.68;
    group.add(card);

    return {
      chair,
      group,
      card,
      direction: direction.clone(),
      drinkType,
      hasLiquid: true,
      hasFoam: drinkType === "beer",
      liquidProfile: { ...drink.userData.liquidProfile },
      chairPosition: chairPosition.clone(),
      platePosition: platePosition.clone(),
    };
  }

  function createRoom(scene) {
    scene.background = new THREE.Color(0x160c2b);
    scene.fog = new THREE.FogExp2(0x160c2b, 0.025);

    const floor = setShadow(
      new THREE.Mesh(
        new THREE.PlaneGeometry(46, 36),
        new THREE.MeshStandardMaterial({ color: 0x24122f, roughness: 0.95 })
      ),
      false,
      true
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.03;
    scene.add(floor);

    const colors = [0xff5d8f, 0x4fb6ff, 0x6fe0a0, 0xffcf56, 0xc58bff];
    for (let i = 0; i < 54; i++) {
      const confetti = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.02, 0.25),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.65 })
      );
      const angle = Math.random() * TAU;
      const radius = 7 + Math.random() * 9;
      confetti.position.set(Math.sin(angle) * radius, 0.02, Math.cos(angle) * radius);
      confetti.rotation.y = Math.random() * TAU;
      scene.add(confetti);
    }
  }

  function createTable(scene) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6c3a25, roughness: 0.83 });
    const cloth = new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.78 });
    const runner = new THREE.MeshStandardMaterial({ color: 0xffe6a8, roughness: 0.88 });

    const top = setShadow(new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.34, 9.55), wood), true, true);
    top.position.y = 1.34;
    group.add(top);

    const clothTop = setShadow(new THREE.Mesh(new THREE.BoxGeometry(13.66, 0.15, 9.7), cloth), true, true);
    clothTop.position.y = 1.55;
    group.add(clothTop);

    const tableRunner = setShadow(new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.045, 9.74), runner), true, true);
    tableRunner.position.y = TABLE_SURFACE_Y + 0.015;
    group.add(tableRunner);

    [[-5.6, -3.6], [5.6, -3.6], [-5.6, 3.6], [5.6, 3.6]].forEach(([x, z]) => {
      const leg = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.35, 0.48), wood), true, true);
      leg.position.set(x, 0.66, z);
      group.add(leg);
    });

    scene.add(group);
    return group;
  }

  function createWalker(options) {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: options.skin, roughness: 0.86 });
    const cloth = new THREE.MeshStandardMaterial({ color: options.clothes, roughness: 0.84 });
    const dark = new THREE.MeshStandardMaterial({ color: options.dark || 0x291b2f, roughness: 0.9 });
    const accent = new THREE.MeshStandardMaterial({ color: options.accent || 0xffcf56, roughness: 0.82 });

    const body = setShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 1.15, 7), cloth),
      true,
      true
    );
    body.position.y = 1.6;
    group.add(body);

    if (options.skirt) {
      const skirt = setShadow(new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.82, 7), accent), true, true);
      skirt.position.y = 1.02;
      group.add(skirt);
    }

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 7), skin);
    neck.position.y = 2.23;
    group.add(neck);

    const head = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), skin), true, true);
    head.position.y = 2.58;
    group.add(head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.355, 8, 5, 0, TAU, 0, Math.PI * 0.48), dark);
    hair.position.y = 2.69;
    group.add(hair);

    if (options.beard) {
      const beard = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.38, 7), dark);
      beard.position.set(0, 2.39, 0.22);
      beard.rotation.x = Math.PI;
      group.add(beard);
    }

    if (options.accessory === "hat") {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 12), accent);
      brim.position.y = 2.89;
      group.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.38, 9), accent);
      crown.position.y = 3.08;
      group.add(crown);
    } else if (options.accessory === "cap") {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.37, 8, 5, 0, TAU, 0, Math.PI * 0.5), accent);
      cap.position.y = 2.83;
      group.add(cap);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.28), accent);
      visor.position.set(0, 2.83, 0.31);
      group.add(visor);
    }

    const limbs = [];
    [-1, 1].forEach((side) => {
      const armPivot = new THREE.Group();
      armPivot.position.set(side * 0.42, 2.02, 0);
      const arm = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.92, 6), cloth), true, true);
      arm.position.y = -0.42;
      armPivot.add(arm);
      group.add(armPivot);

      const legPivot = new THREE.Group();
      legPivot.position.set(side * 0.2, options.skirt ? 0.83 : 1.05, 0);
      const leg = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 1.02, 6), dark), true, true);
      leg.position.y = -0.48;
      legPivot.add(leg);
      group.add(legPivot);
      limbs.push({ arm: armPivot, leg: legPivot, side });
    });

    group.scale.setScalar(options.scale || 1);
    group.userData.limbs = limbs;
    return group;
  }

  // Monigotes protagonistas: geometría low-poly separada de los NPC caminantes.
  function createSmallGlasses(group, y, z, material, radius = 0.12) {
    [-1, 1].forEach((side) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 5, 14), material);
      ring.position.set(side * (radius + 0.045), y, z);
      group.add(ring);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.025), material);
    bridge.position.set(0, y, z);
    group.add(bridge);
  }

  function createSeatedPerson(person, index, chairPosition, outwardDirection) {
    const profiles = {
      hungryman: {
        scale: 1.38,
        width: 1.18,
        torso: 0x6a2743,
        skin: 0xc9825b,
        hair: 0x171219,
        headY: 2.08,
        headRadius: 0.41,
        traits: ["largest", "bald", "long-black-beard"],
      },
      dientes: {
        scale: 1.14,
        width: 1,
        torso: 0x355f91,
        skin: 0xe0a47c,
        hair: 0x30231f,
        headY: 1.98,
        headRadius: 0.43,
        traits: ["round-glasses", "thin-moustache", "neck-length-thick-hair"],
      },
      daviles: {
        scale: 1.14,
        width: 1,
        torso: 0xf7f5ed,
        skin: 0xd89a72,
        hair: 0x432c25,
        headY: 1.98,
        headRadius: 0.43,
        traits: ["full-beard", "short-hair", "pharmacist-coat", "orange-cat"],
      },
      carlos: {
        scale: 1.02,
        width: 0.92,
        torso: 0x3f745f,
        skin: 0xefc3a0,
        hair: 0x32231f,
        headY: 1.98,
        headRadius: 0.44,
        traits: ["smallest", "trimmed-beard", "small-glasses", "neat-fringe"],
      },
    };
    const profile = profiles[person.id] || profiles.dientes;
    const root = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: profile.skin, roughness: 0.86 });
    const clothes = new THREE.MeshStandardMaterial({ color: profile.torso, roughness: 0.82 });
    const dark = new THREE.MeshStandardMaterial({ color: profile.hair, roughness: 0.93 });
    const trousers = new THREE.MeshStandardMaterial({ color: 0x252331, roughness: 0.92 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x171822, metalness: 0.34, roughness: 0.42 });
    const bodyRadius = 0.46 * profile.width;

    const body = setShadow(
      new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius * 0.84, bodyRadius, 1.18, 7), clothes),
      true,
      true
    );
    body.position.y = 1.17;
    root.add(body);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.2, 7), skin);
    neck.position.y = 1.78;
    root.add(neck);

    const headRadius = profile.headRadius;
    const head = setShadow(new THREE.Mesh(new THREE.SphereGeometry(headRadius, 8, 6), skin), true, true);
    head.position.y = profile.headY;
    root.add(head);

    [-1, 1].forEach((side) => {
      const arm = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.78, 6), clothes), true, true);
      arm.position.set(side * bodyRadius * 0.92, 1.17, 0.16);
      arm.rotation.x = -0.34;
      arm.rotation.z = side * 0.08;
      root.add(arm);

      const thigh = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.72, 6), trousers), true, true);
      thigh.position.set(side * 0.2, 0.55, 0.34);
      thigh.rotation.x = Math.PI / 2;
      root.add(thigh);

      const shin = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.74, 6), trousers), true, true);
      shin.position.set(side * 0.2, 0.2, 0.68);
      root.add(shin);
    });

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x211921 });
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 6, 4), eyeMaterial);
      eye.position.set(side * headRadius * 0.34, profile.headY + 0.04, headRadius * 0.94);
      root.add(eye);
    });

    if (person.id === "hungryman") {
      const beardCrown = new THREE.Mesh(new THREE.SphereGeometry(0.39, 7, 5), dark);
      beardCrown.scale.set(1.02, 0.72, 0.58);
      beardCrown.position.set(0, profile.headY - 0.18, 0.28);
      root.add(beardCrown);
      const beard = setShadow(new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.22, 7), dark), true, true);
      beard.position.set(0, profile.headY - 0.67, 0.3);
      beard.rotation.z = Math.PI;
      root.add(beard);
    } else {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(headRadius + 0.025, 8, 5, 0, TAU, 0, Math.PI * 0.52), dark);
      hair.position.y = profile.headY + 0.08;
      root.add(hair);
    }

    if (person.id === "dientes") {
      const backHair = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.76, 0.28), dark), true, true);
      backHair.position.set(0, profile.headY - 0.25, -0.22);
      root.add(backHair);
      createSmallGlasses(root, profile.headY + 0.04, headRadius * 0.96, glass, 0.135);
      [-1, 1].forEach((side) => {
        const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.045, 0.065), dark);
        moustache.position.set(side * 0.09, profile.headY - 0.11, headRadius * 0.96);
        moustache.rotation.z = side * 0.13;
        root.add(moustache);
      });
    }

    if (person.id === "daviles") {
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 5), dark);
      beard.scale.set(1.02, 0.72, 0.64);
      beard.position.set(0, profile.headY - 0.2, 0.29);
      root.add(beard);
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.82, 0.025),
        new THREE.MeshStandardMaterial({ color: 0xb8c4c7, roughness: 0.72 })
      );
      seam.position.set(0, 1.15, bodyRadius * 0.89);
      root.add(seam);
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.14, 0.025),
        new THREE.MeshStandardMaterial({ color: 0x5aa6cb, roughness: 0.6 })
      );
      badge.position.set(0.23, 1.39, bodyRadius * 0.88);
      root.add(badge);

      const orange = new THREE.MeshStandardMaterial({ color: 0xe77f2f, roughness: 0.9 });
      const cat = new THREE.Group();
      const catBody = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), orange);
      catBody.scale.set(0.78, 1.25, 0.72);
      cat.add(catBody);
      const catHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), orange);
      catHead.position.set(0, 0.27, 0.03);
      cat.add(catHead);
      [-1, 1].forEach((side) => {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.14, 4), orange);
        ear.position.set(side * 0.08, 0.42, 0.02);
        cat.add(ear);
      });
      cat.position.set(0.5, 1.72, 0.03);
      cat.rotation.z = -0.16;
      root.add(cat);
    }

    if (person.id === "carlos") {
      createSmallGlasses(root, profile.headY + 0.04, headRadius * 0.96, glass, 0.125);
      const beard = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.15, 0.08), dark);
      beard.position.set(0, profile.headY - 0.2, headRadius * 0.91);
      root.add(beard);
      [-0.23, 0, 0.23].forEach((x, fringeIndex) => {
        const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18 + fringeIndex * 0.025, 0.15), dark);
        fringe.position.set(x, profile.headY + 0.29, headRadius * 0.78);
        fringe.rotation.z = (1 - fringeIndex) * 0.09;
        root.add(fringe);
      });
    }

    root.scale.setScalar(profile.scale);
    root.position.copy(chairPosition).addScaledVector(outwardDirection, person.id === "hungryman" ? 0.18 : 0);
    root.position.y = 0.88;
    root.rotation.y = Math.atan2(-outwardDirection.x, -outwardDirection.z);
    root.userData.personId = person.id;

    return {
      id: person.id,
      index,
      mesh: root,
      scale: profile.scale,
      traits: profile.traits,
      headLocalY: profile.headY,
      headWorldY: root.position.y + profile.headY * profile.scale,
      headRadiusWorld: profile.headRadius * profile.scale,
      chairPosition: chairPosition.clone(),
    };
  }

  function createCrowd(scene) {
    const styles = [
      { skin: 0xd99b72, clothes: 0x4fb6ff, accent: 0xffcf56, accessory: "cap", beard: true },
      { skin: 0x7e4b32, clothes: 0xff5d8f, accent: 0x6fe0a0, accessory: "hat", skirt: true },
      { skin: 0xf0bf99, clothes: 0x6fe0a0, accent: 0xc58bff, beard: true },
      { skin: 0xb86f4f, clothes: 0xffcf56, accent: 0xff5d8f, accessory: "cap", skirt: true },
      { skin: 0xefd0b2, clothes: 0xc58bff, accent: 0x4fb6ff, accessory: "hat" },
      { skin: 0x8f573c, clothes: 0xf06b49, accent: 0xffcf56, skirt: true },
      { skin: 0xc9825b, clothes: 0x3fa58b, accent: 0xff7daf, accessory: "cap" },
      { skin: 0xf2c5a4, clothes: 0x945ee8, accent: 0xffcf56, skirt: true, accessory: "hat" },
      { skin: 0x6f432f, clothes: 0x348bd1, accent: 0xffcf56, beard: true, accessory: "hat" },
      { skin: 0xe0a47c, clothes: 0xdc4779, accent: 0x73e0bd, skirt: true, accessory: "cap" },
      { skin: 0xa96346, clothes: 0x89bd45, accent: 0xe96b4c, beard: true },
      { skin: 0xf1c8aa, clothes: 0xf0a43c, accent: 0x6f7bea, skirt: true, accessory: "hat" },
      { skin: 0x80503a, clothes: 0x9b68d7, accent: 0xffdf76, accessory: "cap" },
      { skin: 0xd28e68, clothes: 0x36a69a, accent: 0xff719d, skirt: true },
      { skin: 0xf3d0b4, clothes: 0xbd4e68, accent: 0x55b9f1, beard: true, accessory: "cap" },
      { skin: 0x9d6145, clothes: 0xe4b63f, accent: 0x8f65dd, skirt: true, accessory: "hat" },
    ];

    return styles.map((style, index) => {
      const mesh = createWalker({ ...style, scale: 0.88 + (index % 3) * 0.045 });
      const id = `npc-${String(index + 1).padStart(2, "0")}`;
      mesh.userData.npcId = id;
      scene.add(mesh);
      return {
        id,
        name: `Invitado ${index + 1}`,
        mesh,
        phase: (index / styles.length) * TAU + (index % 2 ? 0.18 : 0),
        speed: 0.075 + (index % 4) * 0.009,
        radiusX: 10.9 + (index % 3) * 0.72,
        radiusZ: 7.9 + ((index + 1) % 3) * 0.52,
        direction: index % 3 === 0 ? -1 : 1,
        kind: style.skirt ? "girl" : "guest",
        accessory: style.accessory || (style.beard ? "beard" : "none"),
        phrases: [],
        paused: false,
        dialogElement: null,
        dialogTimer: null,
      };
    });
  }

  function updateWalker(walker, time, camera) {
    const angle = walker.phase + time * walker.speed * walker.direction;
    const nextAngle = angle + 0.012 * walker.direction;
    const x = Math.cos(angle) * walker.radiusX;
    const z = Math.sin(angle) * walker.radiusZ;
    const nextX = Math.cos(nextAngle) * walker.radiusX;
    const nextZ = Math.sin(nextAngle) * walker.radiusZ;
    if (!walker.paused) {
      walker.mesh.position.set(x, 0, z);
      walker.mesh.rotation.y = Math.atan2(nextX - x, nextZ - z);
    } else {
      walker.mesh.rotation.y = Math.atan2(
        camera.position.x - walker.mesh.position.x,
        camera.position.z - walker.mesh.position.z
      );
    }

    const stride = walker.paused ? 0 : Math.sin(time * 5.2 + walker.phase * 2);
    walker.mesh.userData.limbs.forEach((limb) => {
      limb.arm.rotation.x = stride * 0.52 * limb.side;
      limb.leg.rotation.x = -stride * 0.58 * limb.side;
    });
  }

  function intersectsFurniture(position) {
    if (Math.abs(position.x) < 7.25 && Math.abs(position.z) < 5.2) return true;
    const chairs = [[7.55, 0], [-7.55, 0], [0, 5.55], [0, -5.55]];
    return chairs.some(([x, z]) => Math.hypot(position.x - x, position.z - z) < 1.35);
  }

  // TODO: ajustar geometría de la tarta según foto de referencia del usuario
  function createCakeGeometry(scene, people, glowTexture) {
    const cakeRoot = new THREE.Group();
    cakeRoot.position.y = TABLE_SURFACE_Y + 0.09;
    scene.add(cakeRoot);

    const stand = setShadow(
      new THREE.Mesh(
        new THREE.BoxGeometry(CAKE_WIDTH + 0.72, 0.16, CAKE_DEPTH + 0.72),
        new THREE.MeshStandardMaterial({ color: 0xf4e5ce, metalness: 0.08, roughness: 0.35 })
      ),
      true,
      true
    );
    stand.position.y = -0.09;
    cakeRoot.add(stand);

    const spinGroup = new THREE.Group();
    cakeRoot.add(spinGroup);

    const slices = new Map();
    const candles = new Map();
    const clickableMeshes = [];
    const quadrantBounds = [
      { xMin: -CAKE_WIDTH / 2, xMax: 0, zMin: 0, zMax: CAKE_DEPTH / 2 },
      { xMin: 0, xMax: CAKE_WIDTH / 2, zMin: 0, zMax: CAKE_DEPTH / 2 },
      { xMin: 0, xMax: CAKE_WIDTH / 2, zMin: -CAKE_DEPTH / 2, zMax: 0 },
      { xMin: -CAKE_WIDTH / 2, xMax: 0, zMin: -CAKE_DEPTH / 2, zMax: 0 },
    ];
    const whiteIcing = new THREE.MeshStandardMaterial({ color: 0xfff7e8, roughness: 0.68, transparent: true });
    const chocolate = new THREE.MeshStandardMaterial({ color: 0x8d4b2d, roughness: 0.92, transparent: true });
    const berryMaterial = new THREE.MeshStandardMaterial({ color: 0xd72e43, roughness: 0.74 });

    people.forEach((person, personIndex) => {
      const bounds = quadrantBounds[personIndex];
      const center = {
        x: (bounds.xMin + bounds.xMax) / 2,
        z: (bounds.zMin + bounds.zMax) / 2,
      };
      const corners = [
        { x: bounds.xMin, z: bounds.zMax },
        { x: bounds.xMax, z: bounds.zMax },
        { x: bounds.xMax, z: bounds.zMin },
        { x: bounds.xMin, z: bounds.zMin },
      ];
      const inset = 0.12;
      const panelBounds = {
        xMin: bounds.xMin + inset,
        xMax: bounds.xMax - inset,
        zMin: bounds.zMin + inset,
        zMax: bounds.zMax - inset,
      };
      const panelCenter = {
        x: (panelBounds.xMin + panelBounds.xMax) / 2,
        z: (panelBounds.zMin + panelBounds.zMax) / 2,
      };
      const panelCorners = [
        { x: panelBounds.xMin, z: panelBounds.zMax },
        { x: panelBounds.xMax, z: panelBounds.zMax },
        { x: panelBounds.xMax, z: panelBounds.zMin },
        { x: panelBounds.xMin, z: panelBounds.zMin },
      ];
      const segments = [];
      const angleMid = Math.atan2(center.x, center.z) * 180 / Math.PI;

      for (let biteIndex = 0; biteIndex < BITE_STEPS; biteIndex++) {
        const next = (biteIndex + 1) % BITE_STEPS;
        const bodyPoints = [center, corners[biteIndex], corners[next]];
        const geometry = new THREE.ExtrudeGeometry(buildTriangleShape(bodyPoints), {
          depth: CAKE_HEIGHT,
          bevelEnabled: false,
          curveSegments: 1,
        });
        const capMaterial = whiteIcing.clone();
        const sideMaterial = chocolate.clone();
        const mesh = setShadow(new THREE.Mesh(geometry, [capMaterial, sideMaterial]), true, true);
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData = { personId: person.id, biteIndex };
        spinGroup.add(mesh);
        clickableMeshes.push(mesh);

        const cream = new THREE.Group();
        const panelPoints = [panelCenter, panelCorners[biteIndex], panelCorners[next]];
        const panelGeometry = new THREE.ExtrudeGeometry(buildTriangleShape(panelPoints), {
          depth: 0.075,
          bevelEnabled: false,
          curveSegments: 1,
        });
        const panel = setShadow(
          new THREE.Mesh(panelGeometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(person.color), roughness: 0.64 })),
          true,
          true
        );
        panel.rotation.x = -Math.PI / 2;
        panel.position.y = CAKE_HEIGHT + 0.025;
        cream.add(panel);

        if (biteIndex % 2 === 0) {
          const berry = setShadow(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.28), berryMaterial), true, true);
          berry.position.set(
            (center.x + corners[biteIndex].x + corners[next].x) / 3,
            CAKE_HEIGHT + 0.19,
            (center.z + corners[biteIndex].z + corners[next].z) / 3
          );
          cream.add(berry);
        }

        const isOuterEdge = (
          (biteIndex === 0 && bounds.zMax === CAKE_DEPTH / 2) ||
          (biteIndex === 1 && bounds.xMax === CAKE_WIDTH / 2) ||
          (biteIndex === 2 && bounds.zMin === -CAKE_DEPTH / 2) ||
          (biteIndex === 3 && bounds.xMin === -CAKE_WIDTH / 2)
        );
        if (isOuterEdge) {
          const edgeA = corners[biteIndex];
          const edgeB = corners[next];
          [0.34, 0.68].forEach((fraction, dripIndex) => {
            const drip = setShadow(
              new THREE.Mesh(
                new THREE.BoxGeometry(biteIndex % 2 === 0 ? 0.28 : 0.09, 0.3 + dripIndex * 0.12, biteIndex % 2 === 0 ? 0.09 : 0.28),
                whiteIcing
              ),
              true,
              true
            );
            drip.position.set(
              edgeA.x + (edgeB.x - edgeA.x) * fraction,
              CAKE_HEIGHT - 0.1 - dripIndex * 0.06,
              edgeA.z + (edgeB.z - edgeA.z) * fraction
            );
            cream.add(drip);
          });
        }

        spinGroup.add(cream);
        segments.push({ mesh, capMaterial, sideMaterial, cream, mid: angleMid });
      }

      slices.set(person.id, {
        id: person.id,
        personIndex,
        angleMid,
        segments,
        biteOrder: [0, 2, 1, 3],
        bites: 0,
        biting: false,
        removed: false,
      });
    });

    people.forEach((person, index) => {
      const bounds = quadrantBounds[index];
      const position = {
        x: (bounds.xMin + bounds.xMax) / 2,
        z: (bounds.zMin + bounds.zMax) / 2,
      };
      const mid = Math.atan2(position.x, position.z) * 180 / Math.PI;
      const group = new THREE.Group();
      group.position.set(position.x, CAKE_HEIGHT, position.z);
      spinGroup.add(group);

      const stickMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(person.color), roughness: 0.5 });
      const stick = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, CANDLE_HEIGHT, 18), stickMaterial), true, true);
      stick.position.y = CANDLE_HEIGHT / 2;
      group.add(stick);

      [0.3, 0.66].forEach((fraction) => {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.105, 0.105, 0.1, 18),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
        );
        band.position.y = CANDLE_HEIGHT * fraction;
        group.add(band);
      });

      const wick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.017, 0.017, 0.16, 8),
        new THREE.MeshStandardMaterial({ color: 0x35231b, roughness: 1 })
      );
      wick.position.y = CANDLE_HEIGHT + 0.07;
      group.add(wick);

      const flameGroup = new THREE.Group();
      flameGroup.position.y = CANDLE_HEIGHT + 0.16;
      group.add(flameGroup);

      const flameMaterial = new THREE.MeshStandardMaterial({
        color: 0xffc04c,
        emissive: 0xff6b18,
        emissiveIntensity: 1.8,
        transparent: true,
      });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.34, 16), flameMaterial);
      flame.position.y = 0.17;
      flameGroup.add(flame);

      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffd48a,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.set(0.68, 0.68, 1);
      glow.position.y = 0.16;
      flameGroup.add(glow);

      const light = new THREE.PointLight(0xffad55, 0.8, 3.1, 2);
      light.position.y = 0.2;
      flameGroup.add(light);

      const ringMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(person.color),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.29, 0.43, 36), ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.025;
      group.add(ring);

      candles.set(person.id, {
        id: person.id,
        group,
        flameGroup,
        flame,
        flameMaterial,
        glow,
        glowMaterial,
        light,
        ring,
        ringMaterial,
        angleMid: mid,
        seed: Math.random() * 10,
        blownOut: false,
      });
    });

    return {
      cakeRoot,
      spinGroup,
      slices,
      candles,
      clickableMeshes,
      profile: {
        style: "minecraft-block",
        shape: "rectangular-prism",
        width: CAKE_WIDTH,
        depth: CAKE_DEPTH,
        height: CAKE_HEIGHT,
        quadrantCount: people.length,
        biteSegmentsPerQuadrant: BITE_STEPS,
        redCubeCount: people.length * 2,
      },
    };
  }

  function createCake3D({ canvas, people, dialogLayer }) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    createRoom(scene);
    createTable(scene);
    const walkers = createCrowd(scene);

    scene.add(new THREE.HemisphereLight(0xeadfff, 0x27132f, 1.4));
    const keyLight = new THREE.DirectionalLight(0xffe7bf, 3.2);
    keyLight.position.set(6, 12, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0x896dff, 35, 28, 2);
    fillLight.position.set(-8, 7, -5);
    scene.add(fillLight);
    const warmLight = new THREE.PointLight(0xff9b55, 42, 24, 2);
    warmLight.position.set(7, 5, 6);
    scene.add(warmLight);

    const step = 360 / people.length;
    const placeSettings = [];
    const seatedPeople = new Map();
    people.forEach((person, index) => {
      const angleMid = index * step + step / 2 + ANGLE_OFFSET;
      const setting = createPlaceSetting(person, index, angleMid);
      const seated = createSeatedPerson(person, index, setting.chairPosition, setting.direction);
      scene.add(setting.chair);
      scene.add(setting.group);
      scene.add(seated.mesh);
      seatedPeople.set(person.id, seated);
      placeSettings.push({
        id: person.id,
        seatAzimuth: Math.atan2(setting.chairPosition.x, setting.chairPosition.z),
        drinkType: setting.drinkType,
        hasLiquid: setting.hasLiquid,
        hasFoam: setting.hasFoam,
        liquidProfile: setting.liquidProfile,
        card: setting.card,
        chairPosition: setting.chairPosition,
        platePosition: setting.platePosition,
      });
    });

    const cake = createCakeGeometry(scene, people, createGlowTexture());
    const { cakeRoot, spinGroup, slices, candles, clickableMeshes, profile: cakeProfile } = cake;

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
    const cameraTarget = new THREE.Vector3();
    const overviewPose = { radius: 16.65, height: 8.15, azimuth: 0.73, targetY: TABLE_SURFACE_Y + 0.72 };
    const cameraPose = { ...overviewPose };
    let cameraFocus = 0;
    let maxCameraFocus = 0;
    let minimumCameraRadius = cameraPose.radius;
    let cameraAuto = false;
    let cameraMode = "overview";
    let focusedPersonId = null;
    let lastSpinTrace = [];
    let lastAlignment = null;
    let lastBiteAnimationDurationMs = null;
    let lastBiteAnimationElapsedMs = null;

    let spinning = false;
    let armedId = null;
    let interactive = false;
    let baseRotationY = 0;
    let elapsed = 0;
    let destroyed = false;
    const puffs = [];
    const activeTweens = [];
    const sliceClickListeners = [];
    const clock = new THREE.Clock();
    let activeNpc = null;

    function setNpcData(data) {
      const entries = Array.isArray(data && data.npcs) ? data.npcs : [];
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      walkers.forEach((walker) => {
        const entry = byId.get(walker.id);
        if (!entry) return;
        walker.name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : walker.name;
        walker.phrases = Array.isArray(entry.phrases)
          ? entry.phrases.filter((phrase) => typeof phrase === "string" && phrase.trim()).map((phrase) => phrase.trim())
          : [];
      });
    }

    function hideNpcDialog(walker) {
      if (!walker) return;
      if (walker.dialogTimer) global.clearTimeout(walker.dialogTimer);
      walker.dialogTimer = null;
      if (walker.dialogElement) walker.dialogElement.remove();
      walker.dialogElement = null;
      if (walker.paused && Number.isFinite(walker.pauseStartedAt)) {
        walker.phase -= (elapsed - walker.pauseStartedAt) * walker.speed * walker.direction;
      }
      walker.pauseStartedAt = null;
      walker.paused = false;
      if (activeNpc === walker) activeNpc = null;
    }

    function talkToNpc(id) {
      const walker = walkers.find((candidate) => candidate.id === id);
      if (!walker) return { found: false, speaking: false };
      if (walker.paused) {
        hideNpcDialog(walker);
        return { found: true, speaking: false, id: walker.id };
      }

      if (activeNpc) hideNpcDialog(activeNpc);
      walker.paused = true;
      walker.pauseStartedAt = elapsed;
      activeNpc = walker;
      const choices = walker.phrases.length > 0 ? walker.phrases : ["¡Feliz cumpleaños!"];
      const phrase = choices[Math.floor(Math.random() * choices.length)];

      if (dialogLayer) {
        const bubble = document.createElement("div");
        bubble.className = "npc-dialog";
        const name = document.createElement("strong");
        name.textContent = walker.name;
        const text = document.createElement("span");
        text.textContent = phrase;
        bubble.append(name, text);
        dialogLayer.appendChild(bubble);
        walker.dialogElement = bubble;
      }

      walker.dialogTimer = global.setTimeout(
        () => hideNpcDialog(walker),
        TEST_MODE ? 650 : 4300
      );
      return { found: true, speaking: true, id: walker.id, name: walker.name, phrase };
    }

    function objectScreenPosition(object, localY = 0) {
      const world = new THREE.Vector3(0, localY, 0);
      object.localToWorld(world);
      world.project(camera);
      return {
        x: (world.x * 0.5 + 0.5) * canvas.clientWidth,
        y: (-world.y * 0.5 + 0.5) * canvas.clientHeight,
        visible: world.z > -1 && world.z < 1 && world.x > -1 && world.x < 1 && world.y > -1 && world.y < 1,
      };
    }

    function npcScreenPosition(walker, localY = 2.05) {
      return objectScreenPosition(walker.mesh, localY);
    }

    function updateNpcDialogs() {
      walkers.forEach((walker) => {
        if (!walker.dialogElement) return;
        const screen = npcScreenPosition(walker, 3.35);
        walker.dialogElement.hidden = !screen.visible;
        walker.dialogElement.style.left = `${screen.x}px`;
        walker.dialogElement.style.top = `${screen.y}px`;
      });
    }

    function updateCamera() {
      camera.position.set(
        Math.sin(cameraPose.azimuth) * cameraPose.radius,
        cameraPose.height,
        Math.cos(cameraPose.azimuth) * cameraPose.radius
      );
      cameraTarget.set(0, cameraPose.targetY, 0);
      camera.lookAt(cameraTarget);
    }

    function resize() {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const aspect = width / height;
      renderer.setSize(width, height, false);
      camera.aspect = aspect;
      camera.fov = aspect < 0.72 ? 44 : aspect < 1 ? 40 : 35;
      camera.updateProjectionMatrix();

      const nextOverview = aspect < 0.78
        ? { radius: Math.hypot(18.5, 20.5), height: 13.6, azimuth: Math.atan2(18.5, 20.5) }
        : { radius: Math.hypot(11.1, 12.4), height: 8.15, azimuth: Math.atan2(11.1, 12.4) };
      overviewPose.radius = nextOverview.radius;
      overviewPose.height = nextOverview.height;
      if (!cameraAuto && !spinning && cameraMode === "overview") {
        cameraPose.radius = overviewPose.radius;
        cameraPose.height = overviewPose.height;
        if (!Number.isFinite(cameraPose.azimuth)) cameraPose.azimuth = nextOverview.azimuth;
      }
      updateCamera();
    }

    let resizeObserver = null;
    if (global.ResizeObserver) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
    } else {
      global.addEventListener("resize", resize);
    }
    resize();

    function addTween({ duration, ease = easeOutCubic, onUpdate, onComplete }) {
      return new Promise((resolve) => {
        activeTweens.push({
          start: performance.now(),
          duration: Math.max(1, duration),
          ease,
          onUpdate,
          onComplete: () => {
            if (onComplete) onComplete();
            resolve();
          },
        });
      });
    }

    function spawnSmoke(worldPosition) {
      for (let i = 0; i < 8; i++) {
        const material = new THREE.MeshBasicMaterial({ color: 0xf7f2ec, transparent: true, opacity: 0.78, depthWrite: false });
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.055 + Math.random() * 0.055, 8, 8), material);
        puff.position.copy(worldPosition);
        puff.position.x += (Math.random() - 0.5) * 0.14;
        puff.position.z += (Math.random() - 0.5) * 0.14;
        scene.add(puff);
        puffs.push({
          mesh: puff,
          material,
          life: 0,
          duration: 0.85 + Math.random() * 0.45,
          driftX: (Math.random() - 0.5) * 0.32,
          driftZ: (Math.random() - 0.5) * 0.18,
        });
      }
    }

    function animate() {
      if (destroyed) return;
      const deltaTime = Math.min(clock.getDelta(), 0.05);
      elapsed += deltaTime;

      if (!spinning) spinGroup.rotation.y = baseRotationY;
      if (!REDUCED_MOTION) {
        cakeRoot.rotation.x = 0.012 * Math.sin(elapsed * 0.74);
        cakeRoot.rotation.z = 0.016 * Math.cos(elapsed * 0.61);
      }

      walkers.forEach((walker) => updateWalker(walker, elapsed, camera));

      candles.forEach((candle, id) => {
        if (!candle.blownOut) {
          const pulse = 1 + 0.07 * Math.sin(elapsed * 9 + candle.seed);
          candle.flameGroup.scale.set(pulse, 1 + 0.1 * Math.cos(elapsed * 7.5 + candle.seed), pulse);
          candle.flameGroup.rotation.z = 0.06 * Math.sin(elapsed * 5 + candle.seed);
          candle.glowMaterial.opacity = 0.45 + 0.13 * Math.sin(elapsed * 6 + candle.seed);
        }
        if (id === armedId) {
          candle.ringMaterial.opacity = 0.42 + 0.35 * Math.sin(elapsed * 5.2);
          const ringScale = 1 + 0.12 * Math.sin(elapsed * 5.2);
          candle.ring.scale.setScalar(ringScale);
        } else if (candle.ringMaterial.opacity > 0) {
          candle.ringMaterial.opacity = Math.max(0, candle.ringMaterial.opacity - deltaTime * 2.6);
        }
      });

      for (let i = puffs.length - 1; i >= 0; i--) {
        const puff = puffs[i];
        puff.life += deltaTime;
        const progress = puff.life / puff.duration;
        if (progress >= 1) {
          scene.remove(puff.mesh);
          puff.mesh.geometry.dispose();
          puff.material.dispose();
          puffs.splice(i, 1);
          continue;
        }
        puff.mesh.position.y += deltaTime * 0.82;
        puff.mesh.position.x += puff.driftX * deltaTime;
        puff.mesh.position.z += puff.driftZ * deltaTime;
        puff.mesh.scale.setScalar(1 + progress * 1.8);
        puff.material.opacity = 0.76 * (1 - progress);
      }

      for (let i = activeTweens.length - 1; i >= 0; i--) {
        const tween = activeTweens[i];
        const progress = Math.min(1, (performance.now() - tween.start) / tween.duration);
        tween.onUpdate(tween.ease(progress), progress);
        if (progress >= 1) {
          activeTweens.splice(i, 1);
          tween.onComplete();
        }
      }

      updateCamera();
      updateNpcDialogs();
      renderer.render(scene, camera);
      global.requestAnimationFrame(animate);
    }
    global.requestAnimationFrame(animate);

    async function spinToRandom(excludeIds) {
      if (spinning) return null;
      const excluded = new Set(excludeIds || []);
      const candidates = people.filter((person) => !excluded.has(person.id));
      if (candidates.length === 0) return null;

      spinning = true;
      placeSettings.forEach((placeSetting) => { placeSetting.card.visible = true; });
      cameraAuto = true;
      cameraMode = "transition";
      focusedPersonId = null;
      armedId = null;
      maxCameraFocus = 0;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const candle = candles.get(target.id);
      const setting = placeSettings.find((candidate) => candidate.id === target.id);
      const seated = seatedPeople.get(target.id);
      const localAngle = degToRad(candle.angleMid);
      const seatAzimuth = setting.seatAzimuth;
      const desiredRotation = seatAzimuth - localAngle;
      const currentRotation = spinGroup.rotation.y;
      const delta = ((desiredRotation - currentRotation) % TAU + TAU) % TAU;
      const extraTurns = TEST_MODE ? 2 : 8 + Math.floor(Math.random() * 3);
      const finalRotation = currentRotation + delta + extraTurns * TAU;

      const startPose = { ...cameraPose };
      minimumCameraRadius = startPose.radius;
      const roulettePose = {
        radius: overviewPose.radius,
        height: overviewPose.height,
        azimuth: startPose.azimuth,
        targetY: overviewPose.targetY,
      };
      // Siempre sobre el hombro izquierdo, con suficiente altura y distancia
      // para conservar la tarta completa y sus cuatro velas en el encuadre.
      const shoulderDistance = seated.id === "hungryman" ? 4.25 : 3.65;
      const shoulderOffset = seated.id === "hungryman" ? 0.24 : 0.21;
      const shoulderPose = {
        radius: Math.hypot(seated.mesh.position.x, seated.mesh.position.z) + shoulderDistance,
        height: seated.headWorldY + (seated.id === "hungryman" ? 2.1 : 1.85),
        azimuth: seatAzimuth + shoulderOffset,
        targetY: TABLE_SURFACE_Y + CAKE_HEIGHT * 0.9,
      };
      const resetCamera = addTween({
        duration: CAMERA_RESET_MS,
        ease: easeInOutCubic,
        onUpdate: (progress) => {
          cameraFocus = progress;
          maxCameraFocus = Math.max(maxCameraFocus, cameraFocus);
          cameraPose.radius = startPose.radius + (roulettePose.radius - startPose.radius) * progress;
          minimumCameraRadius = Math.min(minimumCameraRadius, cameraPose.radius);
          cameraPose.height = startPose.height + (roulettePose.height - startPose.height) * progress;
          cameraPose.targetY = startPose.targetY + (roulettePose.targetY - startPose.targetY) * progress;
        },
      });
      lastSpinTrace = [{ progress: 0, easedProgress: 0, rotation: currentRotation }];
      const spin = addTween({
        duration: SPIN_DURATION_MS,
        ease: rouletteEase,
        onUpdate: (progress, linearProgress) => {
          spinGroup.rotation.y = currentRotation + (finalRotation - currentRotation) * progress;
          const lastSample = lastSpinTrace[lastSpinTrace.length - 1];
          if (linearProgress >= 1 || linearProgress - lastSample.progress >= 0.075) {
            lastSpinTrace.push({ progress: linearProgress, easedProgress: progress, rotation: spinGroup.rotation.y });
          }
        },
      });

      await Promise.all([resetCamera, spin]);
      baseRotationY = ((finalRotation % TAU) + TAU) % TAU;
      spinGroup.rotation.y = baseRotationY;
      const worldQuadrantAngle = ((localAngle + baseRotationY) % TAU + TAU) % TAU;
      lastAlignment = {
        id: target.id,
        quadrantWorldAngle: worldQuadrantAngle,
        seatAzimuth,
        error: Math.abs(shortestAngleDelta(worldQuadrantAngle, seatAzimuth)),
      };
      setting.card.visible = false;

      const shoulderStart = { ...cameraPose };
      const shoulderAngleDelta = shortestAngleDelta(shoulderStart.azimuth, shoulderPose.azimuth);
      await addTween({
        duration: CAMERA_SHOULDER_MS,
        ease: easeInOutCubic,
        onUpdate: (progress) => {
          cameraPose.radius = shoulderStart.radius + (shoulderPose.radius - shoulderStart.radius) * progress;
          cameraPose.height = shoulderStart.height + (shoulderPose.height - shoulderStart.height) * progress;
          cameraPose.azimuth = shoulderStart.azimuth + shoulderAngleDelta * progress;
          cameraPose.targetY = shoulderStart.targetY + (shoulderPose.targetY - shoulderStart.targetY) * progress;
          cameraFocus = progress;
        },
        onComplete: () => {
          Object.assign(cameraPose, shoulderPose);
          cameraFocus = 1;
        },
      });

      spinning = false;
      cameraAuto = false;
      cameraMode = "shoulder";
      focusedPersonId = target.id;
      armedId = target.id;
      return target.id;
    }

    function clearArmedHighlight() {
      armedId = null;
    }

    function blowOutCandle(id) {
      const candle = candles.get(id);
      if (!candle || candle.blownOut) return Promise.resolve(false);
      candle.blownOut = true;
      if (armedId === id) armedId = null;

      const worldPosition = new THREE.Vector3();
      candle.flameGroup.getWorldPosition(worldPosition);
      spawnSmoke(worldPosition);

      return addTween({
        duration: BLOW_DURATION_MS,
        ease: easeOutCubic,
        onUpdate: (progress) => {
          const scale = Math.max(0.001, 1 - progress * 1.25);
          candle.flame.scale.setScalar(scale);
          candle.flameMaterial.opacity = 1 - progress;
          candle.glowMaterial.opacity = 0.52 * (1 - progress);
          candle.light.intensity = 0.8 * (1 - progress);
        },
        onComplete: () => { candle.flameGroup.visible = false; },
      }).then(() => true);
    }

    async function biteSlice(id, requestedDurationMs) {
      const slice = slices.get(id);
      if (!interactive || !slice || slice.removed || slice.biting) {
        return slice ? { complete: slice.removed, bites: slice.bites, total: BITE_STEPS, ignored: true } : null;
      }

      slice.biting = true;
      const segmentIndex = slice.biteOrder[slice.bites];
      const segment = slice.segments[segmentIndex];
      const startPosition = segment.mesh.position.clone();
      const outwardPoint = pointOnCircle(0.5, segment.mid);
      const animationDurationMs = Number.isFinite(requestedDurationMs) && requestedDurationMs > 0
        ? requestedDurationMs
        : DEFAULT_BITE_DURATION_MS;
      const animationStartedAt = performance.now();
      lastBiteAnimationDurationMs = animationDurationMs;

      await addTween({
        duration: animationDurationMs,
        ease: easeInOutCubic,
        onUpdate: (progress, linearProgress) => {
          const chewBounce = Math.abs(Math.sin(linearProgress * Math.PI * 8)) * (1 - linearProgress) * 0.09;
          segment.mesh.position.set(
            startPosition.x + outwardPoint.x * progress,
            startPosition.y + 0.72 * progress + chewBounce,
            startPosition.z + outwardPoint.z * progress
          );
          segment.mesh.rotation.z = Math.sin(linearProgress * Math.PI * 8) * (1 - linearProgress) * 0.075;
          segment.mesh.scale.setScalar(Math.max(0.04, 1 - progress * 0.94));
          segment.capMaterial.opacity = 1 - progress;
          segment.sideMaterial.opacity = 1 - progress;
          segment.cream.scale.setScalar(Math.max(0.04, 1 - progress));
        },
      });
      lastBiteAnimationElapsedMs = performance.now() - animationStartedAt;

      segment.mesh.visible = false;
      segment.cream.visible = false;
      slice.bites += 1;
      slice.biting = false;
      slice.removed = slice.bites >= BITE_STEPS;

      if (slice.removed) {
        const candle = candles.get(id);
        if (candle) candle.group.visible = false;
      }

      return {
        complete: slice.removed,
        bites: slice.bites,
        total: BITE_STEPS,
        remaining: Math.max(0, BITE_STEPS - slice.bites),
        animationDurationMs,
        animationElapsedMs: lastBiteAnimationElapsedMs,
      };
    }

    function setSlicesInteractive(value) {
      interactive = Boolean(value);
      if (interactive) placeSettings.forEach((setting) => { setting.card.visible = true; });
      canvas.classList.toggle("is-biteable", interactive);
    }

    function onSliceClick(callback) {
      sliceClickListeners.push(callback);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragPointerId = null;
    let dragLastX = 0;
    let dragDistance = 0;
    let manualDragCount = 0;

    function setRayFromEvent(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    }

    function handlePointerDown(event) {
      setRayFromEvent(event);
      const visibleMeshes = clickableMeshes.filter((mesh) => mesh.visible);
      const sliceHits = raycaster.intersectObjects(visibleMeshes, false);

      if (interactive && sliceHits.length > 0) {
        const id = sliceHits[0].object.userData.personId;
        sliceClickListeners.forEach((callback) => callback(id));
        return;
      }

      const npcHits = raycaster.intersectObjects(walkers.map((walker) => walker.mesh), true);
      if (npcHits.length > 0) {
        let object = npcHits[0].object;
        while (object && !object.userData.npcId) object = object.parent;
        if (object && object.userData.npcId) talkToNpc(object.userData.npcId);
        return;
      }

      const cakeHits = raycaster.intersectObject(cakeRoot, true);
      if (cakeHits.length > 0 || spinning || cameraAuto) return;

      dragPointerId = event.pointerId;
      dragLastX = event.clientX;
      dragDistance = 0;
      canvas.classList.add("is-dragging");
      if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event) {
      if (event.pointerId !== dragPointerId) return;
      const deltaX = event.clientX - dragLastX;
      dragLastX = event.clientX;
      dragDistance += Math.abs(deltaX);
      cameraPose.azimuth -= deltaX * 0.0062;
      cameraMode = "free";
      if (Math.abs(deltaX) > 0) manualDragCount += 1;
    }

    function endPointerDrag(event) {
      if (event.pointerId !== dragPointerId) return;
      if (canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      dragPointerId = null;
      canvas.classList.remove("is-dragging");
    }

    function testDragBy(deltaX) {
      if (spinning || cameraAuto || !Number.isFinite(deltaX)) return false;
      cameraPose.azimuth -= deltaX * 0.0062;
      cameraMode = "free";
      manualDragCount += 1;
      return true;
    }
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", endPointerDrag);
    canvas.addEventListener("pointercancel", endPointerDrag);

    function getSnapshot() {
      const sliceState = {};
      slices.forEach((slice, id) => {
        sliceState[id] = { bites: slice.bites, total: BITE_STEPS, removed: slice.removed, biting: slice.biting };
      });
      return {
        spinning,
        armedId,
        interactive,
        cameraFocus,
        maxCameraFocus,
        cameraAuto,
        cameraMode,
        focusedPersonId,
        cameraPose: { ...cameraPose },
        overviewPose: { ...overviewPose },
        minimumCameraRadius,
        manualDragCount,
        productionSpinDurationMs: PRODUCTION_SPIN_DURATION_MS,
        spinDurationMs: SPIN_DURATION_MS,
        lastSpinTrace: lastSpinTrace.map((sample) => ({ ...sample })),
        lastAlignment: lastAlignment ? { ...lastAlignment } : null,
        cakeScreenPosition: objectScreenPosition(cakeRoot, CAKE_HEIGHT * 0.5),
        candleScreenPositions: [...candles.entries()].map(([id, candle]) => ({
          id,
          ...objectScreenPosition(candle.group, CANDLE_HEIGHT * 0.68),
        })),
        biteAnimation: {
          defaultDurationMs: DEFAULT_BITE_DURATION_MS,
          lastDurationMs: lastBiteAnimationDurationMs,
          lastElapsedMs: lastBiteAnimationElapsedMs,
        },
        cakeProfile: { ...cakeProfile },
        sliceState,
        placeSettings: placeSettings.map((setting) => ({
          id: setting.id,
          seatAzimuth: setting.seatAzimuth,
          drinkType: setting.drinkType,
          hasLiquid: setting.hasLiquid,
          hasFoam: setting.hasFoam,
          liquidProfile: { ...setting.liquidProfile },
          chairPosition: { x: setting.chairPosition.x, y: setting.chairPosition.y, z: setting.chairPosition.z },
          platePosition: { x: setting.platePosition.x, y: setting.platePosition.y, z: setting.platePosition.z },
        })),
        seatedPeople: [...seatedPeople.values()].map((seated) => {
          const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(seated.mesh.quaternion).setY(0).normalize();
          const towardCake = new THREE.Vector3(-seated.mesh.position.x, 0, -seated.mesh.position.z).normalize();
          const headWorld = new THREE.Vector3(0, seated.headLocalY, 0);
          seated.mesh.localToWorld(headWorld);
          const headDistance = camera.position.distanceTo(headWorld);
          return {
            id: seated.id,
            scale: seated.scale,
            traits: [...seated.traits],
            headWorldY: seated.headWorldY,
            headRadiusWorld: seated.headRadiusWorld,
            headViewportFraction: (2 * Math.atan(seated.headRadiusWorld / headDistance)) / degToRad(camera.fov),
            headScreenPosition: objectScreenPosition(seated.mesh, seated.headLocalY),
            position: { x: seated.mesh.position.x, y: seated.mesh.position.y, z: seated.mesh.position.z },
            chairPosition: { x: seated.chairPosition.x, y: seated.chairPosition.y, z: seated.chairPosition.z },
            facingCakeDot: facing.dot(towardCake),
            screenPosition: npcScreenPosition(seated, 1.45),
          };
        }),
        walkers: walkers.map((walker) => ({
          id: walker.id,
          name: walker.name,
          kind: walker.kind,
          accessory: walker.accessory,
          phraseCount: walker.phrases.length,
          paused: walker.paused,
          dialogVisible: Boolean(walker.dialogElement),
          screenPosition: npcScreenPosition(walker),
          position: { x: walker.mesh.position.x, y: walker.mesh.position.y, z: walker.mesh.position.z },
          intersectsFurniture: intersectsFurniture(walker.mesh.position),
        })),
      };
    }

    return {
      spinToRandom,
      clearArmedHighlight,
      blowOutCandle,
      biteSlice,
      setSlicesInteractive,
      onSliceClick,
      setNpcData,
      talkToNpc,
      testDragBy,
      getSnapshot,
      dispose() {
        destroyed = true;
        if (resizeObserver) resizeObserver.disconnect();
        else global.removeEventListener("resize", resize);
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", endPointerDrag);
        canvas.removeEventListener("pointercancel", endPointerDrag);
        walkers.forEach((walker) => hideNpcDialog(walker));
        renderer.dispose();
      },
    };
  }

  global.Cake3D = { create: createCake3D, BITE_STEPS };
})(window);
