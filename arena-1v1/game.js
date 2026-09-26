/* Arena 1v1 — an offline, Apex-style 1v1 duel trainer.
 * Plain browser script (no modules, no network) so it runs from a double-clicked file. */
(function () {
  'use strict';

  // ------------------------------------------------------------------ helpers
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const TAU = Math.PI * 2;
  const V3 = THREE.Vector3;
  const WORLD_UP = new V3(0, 1, 0);

  // ------------------------------------------------------------------ tuning
  const GRAVITY = 22;
  const JUMP_VEL = 7.2;
  const STAND_H = 1.75;
  const CROUCH_H = 1.15;
  const SPEED = { walk: 4.8, sprint: 7.2, crouch: 2.6 };
  const WIN_ROUNDS = 3;

  const DIFF = {
    //        seconds before first shot, aim-tracking speed, aim wobble (m), headshot chance ...
    easy:   { reaction: 0.65, track: 3.5, wobble: 0.34, head: 0.05, burst: [3, 6],  pause: [0.45, 0.8], strafe: 0.5,  jump: 0,    heal: 1.25 },
    normal: { reaction: 0.38, track: 6,   wobble: 0.22, head: 0.15, burst: [5, 9],  pause: [0.25, 0.5], strafe: 0.85, jump: 0.08, heal: 1.0 },
    hard:   { reaction: 0.22, track: 10,  wobble: 0.13, head: 0.3,  burst: [8, 14], pause: [0.12, 0.3], strafe: 1,    jump: 0.2,  heal: 0.9 },
  };

  const WEAPONS = {
    rifle: {
      name: 'CARBINE', auto: true, dmg: 14, head: 1.75, interval: 60 / 620, mag: 28, reserve: 224, reload: 2.1, pellets: 1,
      hip: 0.03, ads: 0.003, bloom: 0.004, bloomMax: 0.03, kickPitch: 0.0055, kickYaw: 0.0028, zoom: 0.72, falloff: [60, 100, 0.8],
    },
    shotgun: {
      name: 'SCATTERGUN', auto: true, dmg: 11, head: 1.25, interval: 0.95, mag: 5, reserve: 30, reload: 2.7, pellets: 11,
      hip: 0.055, ads: 0.042, bloom: 0, bloomMax: 0, kickPitch: 0.035, kickYaw: 0.006, zoom: 0.88, falloff: [10, 30, 0.35],
    },
  };

  const HEALS = {
    cell:    { name: 'SHIELD CELL', time: 3, shield: 25, hp: 0 },
    syringe: { name: 'SYRINGE', time: 5, shield: 0, hp: 25 },
    battery: { name: 'SHIELD BATTERY', time: 5, shield: 100, hp: 0 },
  };
  const HEAL_LOADOUT = { cell: 4, syringe: 4, battery: 2 };

  // ------------------------------------------------------------------ settings
  const settings = { sens: 1.0, adsSens: 0.8, fov: 100, difficulty: 'normal', volume: 0.6, gfx: 'high' };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('arena1v1.settings') || '{}')); } catch (e) { /* no storage */ }
  if (!DIFF[settings.difficulty]) settings.difficulty = 'normal';
  function saveSettings() {
    try { localStorage.setItem('arena1v1.settings', JSON.stringify(settings)); } catch (e) { /* no storage */ }
  }

  // ------------------------------------------------------------------ renderer
  const canvas = $('game');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    $('nowebgl').classList.remove('hidden');
    $('menu').classList.add('hidden');
    return;
  }
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;

  const SKY = 0xa9c4d8;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 70, 210);

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 500);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x7a6448, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.85);
  sun.position.set(-30, 55, 22);
  sun.target.position.set(6, 0, 0);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 55, bottom: -55, near: 1, far: 180 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  function applyGraphics() {
    const high = settings.gfx !== 'low';
    sun.castShadow = high;
    renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio || 1, 1.5) : 0.75);
    renderer.setSize(innerWidth, innerHeight);
  }

  // Viewmodel is drawn in its own pass so the gun never clips into walls.
  const vmScene = new THREE.Scene();
  const vmCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 10);
  vmScene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 0.9));
  const vmSun = new THREE.DirectionalLight(0xffffff, 0.6);
  vmSun.position.set(1, 2, 1);
  vmScene.add(vmSun);

  // ------------------------------------------------------------------ textures & materials
  function canvasTex(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  const floorTex = canvasTex(256, (g, s) => {
    g.fillStyle = '#b8a47e';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.07})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    g.strokeStyle = 'rgba(60,45,25,0.12)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2);
    g.stroke();
    g.strokeStyle = 'rgba(60,45,25,0.35)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, s, s);
  });

  const MAT = {
    floor: new THREE.MeshLambertMaterial({ map: floorTex }),
    wall: new THREE.MeshLambertMaterial({ color: 0x8b98a3 }),
    outer: new THREE.MeshLambertMaterial({ color: 0x6f7c88 }),
    half: new THREE.MeshLambertMaterial({ color: 0xa9b3bb }),
    crateA: new THREE.MeshLambertMaterial({ color: 0xd98a2b }),
    crateB: new THREE.MeshLambertMaterial({ color: 0x3b8c8f }),
    rock: new THREE.MeshLambertMaterial({ color: 0x9c8466 }),
    marker: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
  };
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2a2f36, transparent: true, opacity: 0.45 });

  // ------------------------------------------------------------------ map
  const colliders = [];
  let mapGroup = null;

  function clearMap() {
    if (mapGroup) {
      scene.remove(mapGroup);
      mapGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.map && o.material !== MAT.floor) o.material.map.dispose();
      });
    }
    mapGroup = new THREE.Group();
    scene.add(mapGroup);
    colliders.length = 0;
  }

  function addBox(cx, cz, w, d, h, mat, y0 = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, y0 + h / 2, cz);
    m.castShadow = m.receiveShadow = true;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    e.position.copy(m.position);
    mapGroup.add(m, e);
    colliders.push({ min: new V3(cx - w / 2, y0, cz - d / 2), max: new V3(cx + w / 2, y0 + h, cz + d / 2) });
  }

  function addLabel(text, x, y, z) {
    const tex = canvasTex(128, (g, s) => {
      g.font = 'bold 54px Segoe UI, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.strokeText(text, s / 2, s / 2);
      g.fillStyle = '#fff';
      g.fillText(text, s / 2, s / 2);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.position.set(x, y, z);
    sp.scale.set(2.2, 2.2, 1);
    mapGroup.add(sp);
  }

  function buildArena(x0, x1, z0, z1) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w + 260, d + 260), MAT.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    floorTex.repeat.set((w + 260) / 4, (d + 260) / 4);
    mapGroup.add(floor);
    addBox(cx, z0 - 0.5, w + 2, 1, 5, MAT.outer);
    addBox(cx, z1 + 0.5, w + 2, 1, 5, MAT.outer);
    addBox(x0 - 0.5, cz, 1, d, 5, MAT.outer);
    addBox(x1 + 0.5, cz, 1, d, 5, MAT.outer);
    // distant mesas for a sense of place (not collidable)
    const mesas = [[-90, -70, 30, 22], [40, -95, 40, 30], [120, 10, 28, 26], [-110, 40, 36, 18], [20, 100, 44, 28], [-40, 110, 26, 34]];
    for (const [x, z, r, h] of mesas) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 7), MAT.rock);
      m.position.set(x, h / 2, z);
      mapGroup.add(m);
    }
  }

  // One half of the duel arena; each entry is mirrored through the centre so both spawns are equal.
  //        x,    z,   w,  d,   h,  material
  const DUEL_HALF = [
    [-3.5,   0,  2,  2,   1,  'crateA'],
    [-28,    5,  1,  6, 2.4,  'wall'],
    [-28,   -7,  2,  2,   1,  'crateB'],
    [-21,    0,  2,  2,   1,  'crateA'],
    [-21,   -2,  2,  2,   2,  'crateB'],
    [-19,   13,  7,  1, 2.6,  'wall'],
    [-18,  -13,  2,  2,   2,  'crateA'],
    [-16,  -13,  2,  2,   1,  'crateB'],
    [-12,   -3,  1,  9, 1.2,  'half'],
    [-11,    8,  2,  2,   1,  'crateB'],
    [-9,    18,  2,  2,   2,  'crateA'],
    [-7,   -17,  7,  1, 2.6,  'wall'],
    [-6,     7,  1,  5, 2.6,  'wall'],
    [-5,    -8,  2,  2,   1,  'crateA'],
    [-30,   16,  3,  3,   1,  'crateB'],
    [-30,  -18,  4,  1, 2.6,  'wall'],
  ];
  const DUEL_SPAWNS = [{ x: -32, z: 0, yaw: -Math.PI / 2 }, { x: 32, z: 0, yaw: Math.PI / 2 }];

  function buildDuelMap() {
    clearMap();
    buildArena(-36, 36, -24, 24);
    addBox(0, 0, 5, 5, 2, MAT.wall);
    for (const [x, z, w, d, h, m] of DUEL_HALF) {
      addBox(x, z, w, d, h, MAT[m]);
      addBox(-x, -z, w, d, h, MAT[m]);
    }
  }

  const RANGE_SPAWN = { x: -32, z: 0, yaw: -Math.PI / 2 };
  const RANGE_DUMMIES = [
    { x: -22, z: -4, amp: 0 },
    { x: -22, z: 4, amp: 2.5, speed: 1.6 },
    { x: -12, z: 0, amp: 3, speed: 1.2 },
    { x: -2, z: -6, amp: 0, crouch: true },
    { x: -2, z: 6, amp: 4, speed: 1.8 },
    { x: 13, z: 0, amp: 5, speed: 1.4 },
    { x: 28, z: -3, amp: 0 },
  ];

  function buildRangeMap() {
    clearMap();
    buildArena(-36, 52, -24, 24);
    addBox(-28, 9, 2, 2, 1, MAT.crateA);
    addBox(-28, 11, 2, 2, 2, MAT.crateB);
    addBox(-26, -10, 1, 6, 1.2, MAT.half);
    addBox(-30, -17, 3, 3, 1, MAT.crateB);
    for (const m of [10, 20, 30, 45, 60]) {
      const x = RANGE_SPAWN.x + m;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 46), MAT.marker);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.01, 0);
      mapGroup.add(line);
      addLabel(m + 'm', x, 3.2, -14);
    }
  }

  // ------------------------------------------------------------------ collision & rays
  const EPS = 0.001;
  function overlapsBox(f, b, h) {
    return f.pos.x + f.radius > b.min.x && f.pos.x - f.radius < b.max.x &&
      f.pos.z + f.radius > b.min.z && f.pos.z - f.radius < b.max.z &&
      f.pos.y + h > b.min.y && f.pos.y < b.max.y;
  }
  function blocked(f, h) {
    for (const b of colliders) if (overlapsBox(f, b, h)) return true;
    return false;
  }

  function moveAndCollide(f, dt) {
    const h = f.height;
    const travel = Math.hypot(f.vel.x, f.vel.y, f.vel.z) * dt;
    const steps = Math.max(1, Math.ceil(travel / 0.25));
    const sdt = dt / steps;
    let grounded = false;
    for (let s = 0; s < steps; s++) {
      f.pos.x += f.vel.x * sdt;
      for (const b of colliders) {
        if (!overlapsBox(f, b, h)) continue;
        f.pos.x = f.vel.x > 0 ? b.min.x - f.radius - EPS : b.max.x + f.radius + EPS;
        f.vel.x = 0;
      }
      f.pos.z += f.vel.z * sdt;
      for (const b of colliders) {
        if (!overlapsBox(f, b, h)) continue;
        f.pos.z = f.vel.z > 0 ? b.min.z - f.radius - EPS : b.max.z + f.radius + EPS;
        f.vel.z = 0;
      }
      f.pos.y += f.vel.y * sdt;
      if (f.pos.y <= 0) {
        f.pos.y = 0;
        if (f.vel.y < 0) f.vel.y = 0;
        grounded = true;
      }
      for (const b of colliders) {
        if (!overlapsBox(f, b, h)) continue;
        if (f.vel.y <= 0) { f.pos.y = b.max.y; grounded = true; } else f.pos.y = b.min.y - h - EPS;
        f.vel.y = 0;
      }
    }
    f.onGround = grounded;
  }

  // Slab test; returns distance along the ray or Infinity.
  function rayBox(o, d, mn, mx) {
    let tmin = 0, tmax = Infinity;
    for (const a of ['x', 'y', 'z']) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < mn[a] || o[a] > mx[a]) return Infinity;
        continue;
      }
      let t1 = (mn[a] - o[a]) / d[a], t2 = (mx[a] - o[a]) / d[a];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  }

  function castWorld(o, d, maxT) {
    let best = maxT;
    if (d.y < -1e-6) best = Math.min(best, -o.y / d.y);
    for (const b of colliders) {
      const t = rayBox(o, d, b.min, b.max);
      if (t < best) best = t;
    }
    return best;
  }

  const losDir = new V3();
  function hasLOS(a, b) {
    losDir.subVectors(b, a);
    const len = losDir.length();
    losDir.divideScalar(len);
    return castWorld(a, losDir, len) >= len - 0.05;
  }

  const hbMin = new V3(), hbMax = new V3();
  function hitTest(f, o, d, maxT) {
    const h = f.height, x = f.pos.x, y = f.pos.y, z = f.pos.z;
    let best = null;
    hbMin.set(x - 0.19, y + h - 0.34, z - 0.19);
    hbMax.set(x + 0.19, y + h, z + 0.19);
    let t = rayBox(o, d, hbMin, hbMax);
    if (t < maxT) best = { t, head: true };
    hbMin.set(x - 0.33, y, z - 0.33);
    hbMax.set(x + 0.33, y + h - 0.34, z + 0.33);
    t = rayBox(o, d, hbMin, hbMax);
    if (t < maxT && (!best || t < best.t)) best = { t, head: false };
    return best;
  }

  // ------------------------------------------------------------------ fighters
  function makeFighter(isBot) {
    return {
      isBot, pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, radius: 0.4, height: STAND_H, eyeH: STAND_H - 0.12,
      crouching: false, sliding: false, onGround: false, hp: 100, shield: 100, maxShield: 100, alive: true,
      guns: {}, cur: 'rifle', swapT: 0, fireCd: 0, reloadT: 0, bloom: 0, lastShot: -9,
      heals: {}, healing: null, dashCd: 0, dashT: 0, hitFlash: 0, lastHurt: -99, lastHitByPlayer: -99,
      model: null, deathT: 0,
    };
  }

  function resetFighter(f, x, z, yaw) {
    f.pos.set(x, 0, z);
    f.vel.set(0, 0, 0);
    f.yaw = yaw;
    f.pitch = 0;
    f.hp = 100;
    f.shield = f.maxShield;
    f.alive = true;
    f.crouching = f.sliding = false;
    f.height = STAND_H;
    f.eyeH = STAND_H - 0.12;
    for (const k in WEAPONS) f.guns[k] = { mag: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
    f.cur = 'rifle';
    f.swapT = f.fireCd = f.reloadT = f.bloom = 0;
    f.healing = null;
    f.heals = Object.assign({}, HEAL_LOADOUT);
    f.dashCd = f.dashT = f.hitFlash = f.deathT = 0;
    f.lastHurt = f.lastHitByPlayer = -99;
    if (f.model) {
      f.model.group.visible = true;
      f.model.group.rotation.set(0, yaw, 0);
    }
  }

  function eyePos(f, out) { return out.set(f.pos.x, f.pos.y + f.eyeH, f.pos.z); }
  function chestPos(f, out) { return out.set(f.pos.x, f.pos.y + f.height * 0.6, f.pos.z); }
  function headPos(f, out) { return out.set(f.pos.x, f.pos.y + f.height - 0.17, f.pos.z); }
  function forwardOf(yaw, pitch, out) {
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  }

  function buildHumanoid(color, visorColor) {
    const g = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x23272e });
    const visor = new THREE.MeshBasicMaterial({ color: visorColor });
    const mk = (w, h, d, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      (parent || g).add(m);
      return m;
    };
    const legL = mk(0.22, 0.85, 0.26, dark, -0.13, 0.425, 0);
    const legR = mk(0.22, 0.85, 0.26, dark, 0.13, 0.425, 0);
    const upper = new THREE.Group();
    g.add(upper);
    mk(0.64, 0.62, 0.38, body, 0, 1.16, 0, upper);
    mk(0.3, 0.3, 0.3, body, 0, 1.6, 0, upper);
    mk(0.22, 0.08, 0.04, visor, 0, 1.62, -0.16, upper);
    mk(0.14, 0.5, 0.16, body, -0.4, 1.12, -0.05, upper);
    mk(0.14, 0.5, 0.16, body, 0.4, 1.12, -0.12, upper);
    const gun = mk(0.09, 0.13, 0.75, dark, 0.24, 1.22, -0.45, upper);
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    flash.position.set(0.24, 1.22, -0.9);
    flash.visible = false;
    upper.add(flash);
    scene.add(g);
    return { group: g, upper, legL, legR, gun, flash, body, flashT: 0 };
  }

  function syncModel(f, dt) {
    const m = f.model;
    if (!m) return;
    m.group.position.copy(f.pos);
    if (f.alive) {
      m.group.rotation.set(0, f.yaw, 0);
      const crouch = f.height < STAND_H - 0.1;
      m.upper.position.y = crouch ? -0.55 : 0;
      m.legL.scale.y = m.legR.scale.y = crouch ? 0.35 : 1;
      m.legL.position.y = m.legR.position.y = crouch ? 0.15 : 0.425;
      m.gun.rotation.x = clamp(f.pitch, -0.8, 0.8);
    } else {
      f.deathT += dt;
      m.group.rotation.x = -Math.min(1, f.deathT * 3) * Math.PI / 2;
      if (f.deathT > 2.5) m.group.visible = false;
    }
    f.hitFlash = Math.max(0, f.hitFlash - dt);
    m.body.emissive.setHex(f.hitFlash > 0 ? 0x777777 : 0x000000);
    m.flashT -= dt;
    m.flash.visible = m.flashT > 0;
  }

  const player = makeFighter(false);
  const bot = makeFighter(true);
  bot.model = buildHumanoid(0xc0392b, 0x5ff2ff);
  bot.model.group.visible = false;
  let dummies = [];

  // ------------------------------------------------------------------ game state
  const game = {
    active: false, mode: 'duel', phase: 'menu', phaseT: 0, paused: false, ended: false,
    round: 1, score: [0, 0], time: 0,
    stats: null,
  };
  function freshStats() { return { shots: 0, hits: 0, dmg: 0, heads: 0, kills: 0, taken: 0 }; }
  game.stats = freshStats();

  // ------------------------------------------------------------------ audio (all synthesized)
  let actx = null, master = null, noiseBuf = null;
  function initAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = settings.volume;
      master.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { actx = null; }
  }
  function panNode(pan) {
    if (!actx.createStereoPanner) return null;
    const p = actx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  }
  function sfxNoise(dur, vol, f0, f1, type = 'lowpass', pan = 0) {
    if (!actx) return;
    const t = actx.currentTime;
    const src = actx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = actx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g);
    const p = panNode(pan);
    if (p) g.connect(p).connect(master); else g.connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }
  function sfxTone(freq, dur, type, vol, freqEnd, delay = 0) {
    if (!actx) return;
    const t = actx.currentTime + delay;
    const o = actx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  const SFX = {
    shot(kind, vol = 1, pan = 0) {
      if (kind === 'shotgun') { sfxNoise(0.35, 0.55 * vol, 2400, 200, 'lowpass', pan); sfxTone(110, 0.25, 'sine', 0.5 * vol, 35); }
      else { sfxNoise(0.12, 0.35 * vol, 4200, 400, 'lowpass', pan); sfxTone(160, 0.08, 'sine', 0.25 * vol, 60); }
    },
    hit(head) {
      sfxTone(head ? 2600 : 1700, 0.05, 'square', 0.07);
      if (head) sfxTone(3400, 0.05, 'square', 0.06, null, 0.04);
    },
    shieldBreak() { sfxNoise(0.4, 0.35, 6000, 1500, 'highpass'); sfxTone(1400, 0.25, 'triangle', 0.12, 2800); },
    kill() { sfxTone(880, 0.12, 'triangle', 0.18); sfxTone(1320, 0.2, 'triangle', 0.18, null, 0.1); },
    hurt() { sfxNoise(0.18, 0.3, 900, 200); },
    reload() { sfxTone(420, 0.04, 'square', 0.06); sfxTone(300, 0.05, 'square', 0.06, null, 0.25); },
    empty() { sfxTone(900, 0.03, 'square', 0.05); },
    healDone() { sfxTone(660, 0.12, 'sine', 0.15); sfxTone(990, 0.18, 'sine', 0.15, null, 0.1); },
    dash() { sfxNoise(0.3, 0.25, 800, 3000, 'bandpass'); },
    beep(hi) { sfxTone(hi ? 1320 : 660, hi ? 0.35 : 0.15, 'sine', 0.18); },
    land() { sfxNoise(0.08, 0.12, 500, 150); },
  };

  // ------------------------------------------------------------------ effects: tracers, sparks, damage numbers
  const tracers = [];
  for (let i = 0; i < 70; i++) {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, t: 0 });
  }
  let tracerIdx = 0;
  function spawnTracer(a, b, color) {
    const tr = tracers[tracerIdx++ % tracers.length];
    const p = tr.line.geometry.attributes.position;
    p.setXYZ(0, a.x, a.y, a.z);
    p.setXYZ(1, b.x, b.y, b.z);
    p.needsUpdate = true;
    tr.line.material.color.setHex(color);
    tr.line.visible = true;
    tr.t = 0.07;
  }

  const sparks = [];
  const sparkGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true }));
    m.visible = false;
    scene.add(m);
    sparks.push({ m, t: 0 });
  }
  let sparkIdx = 0;
  function spawnSpark(p) {
    const s = sparks[sparkIdx++ % sparks.length];
    s.m.position.copy(p);
    s.m.visible = true;
    s.t = 0.18;
  }

  const dmgLayer = $('dmgNums');
  const dmgPool = [];
  for (let i = 0; i < 40; i++) {
    const el = document.createElement('div');
    el.style.opacity = 0;
    dmgLayer.appendChild(el);
    dmgPool.push({ el, t: 0, pos: new V3(), dx: 0 });
  }
  let dmgIdx = 0;
  function showDamageNumber(pos, amount, shieldHit, head) {
    const d = dmgPool[dmgIdx++ % dmgPool.length];
    d.pos.copy(pos);
    d.t = 0.9;
    d.dx = rand(-18, 18);
    d.el.textContent = amount;
    d.el.style.color = shieldHit ? '#63bdff' : (head ? '#ffd23f' : '#ffffff');
    d.el.style.fontSize = head ? '22px' : '17px';
  }

  const projV = new V3();
  function updateEffects(dt) {
    for (const tr of tracers) {
      if (tr.t <= 0) continue;
      tr.t -= dt;
      tr.line.material.opacity = clamp(tr.t / 0.07, 0, 1) * 0.9;
      if (tr.t <= 0) tr.line.visible = false;
    }
    for (const s of sparks) {
      if (s.t <= 0) continue;
      s.t -= dt;
      s.m.scale.setScalar(Math.max(0.01, s.t / 0.18));
      s.m.material.opacity = clamp(s.t / 0.18, 0, 1);
      if (s.t <= 0) s.m.visible = false;
    }
    const w = innerWidth, h = innerHeight;
    for (const d of dmgPool) {
      if (d.t <= 0) continue;
      d.t -= dt;
      projV.copy(d.pos).project(camera);
      if (projV.z > 1 || d.t <= 0) { d.el.style.opacity = 0; continue; }
      const rise = (0.9 - d.t) * 50;
      const x = (projV.x * 0.5 + 0.5) * w + d.dx;
      const y = (-projV.y * 0.5 + 0.5) * h - 20 - rise;
      d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      d.el.style.opacity = clamp(d.t / 0.3, 0, 1);
    }
  }

  // ------------------------------------------------------------------ viewmodel
  function buildGunVM(kind) {
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0x2b3038 });
    const accent = new THREE.MeshLambertMaterial({ color: kind === 'rifle' ? 0xd98a2b : 0x7a4b2a });
    const add = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    if (kind === 'rifle') {
      add(0.07, 0.09, 0.42, metal, 0, 0, 0);
      add(0.035, 0.035, 0.34, metal, 0, 0.015, -0.36);
      add(0.05, 0.14, 0.07, accent, 0, -0.1, -0.06);
      add(0.05, 0.07, 0.2, accent, 0, -0.045, 0.28);
      add(0.045, 0.1, 0.05, metal, 0, -0.08, 0.1);
      add(0.012, 0.04, 0.012, metal, 0, 0.065, -0.5);
      add(0.04, 0.03, 0.03, metal, 0, 0.058, 0.14);
    } else {
      add(0.08, 0.1, 0.36, metal, 0, 0, 0);
      add(0.06, 0.06, 0.46, metal, 0, 0.02, -0.4);
      add(0.07, 0.06, 0.18, accent, 0, -0.05, -0.3);
      add(0.055, 0.08, 0.24, accent, 0, -0.03, 0.28);
      add(0.012, 0.03, 0.012, metal, 0, 0.065, -0.6);
    }
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false }));
    flash.position.set(0, 0.02, kind === 'rifle' ? -0.56 : -0.66);
    flash.visible = false;
    g.add(flash);
    g.userData.flash = flash;
    return g;
  }
  const vm = { root: new THREE.Group(), guns: { rifle: buildGunVM('rifle'), shotgun: buildGunVM('shotgun') }, kick: 0, ads: 0, bobT: 0, flashT: 0 };
  vm.root.add(vm.guns.rifle, vm.guns.shotgun);
  vm.root.scale.setScalar(0.6);
  vmScene.add(vm.root);

  function updateViewmodel(dt, ads) {
    const p = player;
    vm.guns.rifle.visible = p.cur === 'rifle';
    vm.guns.shotgun.visible = p.cur === 'shotgun';
    vm.ads += ((ads ? 1 : 0) - vm.ads) * Math.min(1, dt * 14);
    vm.kick = Math.max(0, vm.kick - dt * 9);
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (p.onGround && !p.sliding) vm.bobT += dt * hs * 1.5;
    const bob = (1 - vm.ads * 0.85) * Math.min(1, hs / 7);
    let lower = 0;
    if (p.reloadT > 0) lower = Math.sin(Math.PI * clamp(1 - p.reloadT / WEAPONS[p.cur].reload, 0, 1)) * 0.18;
    if (p.swapT > 0) lower = Math.max(lower, p.swapT / 0.4 * 0.3);
    if (p.healing) lower = 0.45;
    if (!p.alive) lower = 0.6;
    const hip = { x: 0.15, y: -0.15, z: -0.42 }, aim = { x: 0, y: -0.047, z: -0.4 };
    vm.root.position.set(
      hip.x + (aim.x - hip.x) * vm.ads + Math.sin(vm.bobT) * 0.012 * bob,
      hip.y + (aim.y - hip.y) * vm.ads - Math.abs(Math.cos(vm.bobT)) * 0.012 * bob - lower,
      hip.z + (aim.z - hip.z) * vm.ads + vm.kick * 0.05
    );
    vm.root.rotation.set(vm.kick * 0.1 + lower * 0.8, 0.06 * (1 - vm.ads), p.sliding ? 0.25 : lower * 0.6);
    vm.flashT -= dt;
    for (const k in vm.guns) {
      const fl = vm.guns[k].userData.flash;
      fl.visible = vm.flashT > 0 && p.cur === k;
      if (fl.visible) fl.rotation.z = Math.random() * TAU;
    }
  }

  // ------------------------------------------------------------------ input
  const keys = {};
  const pressed = {};
  const mouse = [false, false, false];
  let wheel = 0;
  const locked = () => document.pointerLockElement === canvas;

  addEventListener('keydown', (e) => {
    if (game.active && !game.paused && ['Space', 'Tab', 'KeyQ', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) e.preventDefault();
    if (!e.repeat) pressed[e.code] = true;
    keys[e.code] = true;
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.fill(false); });
  canvas.addEventListener('mousedown', (e) => {
    if (game.active && !game.ended && !locked()) { requestLock(); return; }
    mouse[e.button] = true;
  });
  addEventListener('mouseup', (e) => { mouse[e.button] = false; });
  addEventListener('contextmenu', (e) => { if (game.active) e.preventDefault(); });
  addEventListener('wheel', (e) => { if (game.active && locked()) wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('mousemove', (e) => {
    if (!locked() || !game.active || game.paused || !player.alive) return;
    const ads = vm.ads > 0.5;
    const s = 0.0022 * settings.sens * (ads ? settings.adsSens * WEAPONS[player.cur].zoom : 1);
    player.yaw -= e.movementX * s;
    player.pitch = clamp(player.pitch - e.movementY * s, -1.5, 1.5);
  });

  function requestLock() {
    try {
      const r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { /* browser asks for a second click after Esc */ });
    } catch (e) { /* ignore */ }
  }
  document.addEventListener('pointerlockchange', () => {
    if (locked()) {
      if (game.active) setPaused(false);
    } else if (game.active && !game.ended) {
      setPaused(true);
    }
  });

  // ------------------------------------------------------------------ combat
  function spreadOf(f, ads) {
    const w = WEAPONS[f.cur];
    let s = ads ? w.ads : w.hip;
    const hs = Math.hypot(f.vel.x, f.vel.z);
    if (!f.onGround) s *= 1.8;
    else if (hs > 5.5) s *= 1.35;
    if (f.crouching && !f.sliding) s *= 0.85;
    return s + f.bloom * (ads ? 0.4 : 1);
  }

  function falloff(w, dist) {
    const [a, b, c] = w.falloff;
    if (dist <= a) return 1;
    if (dist >= b) return c;
    return 1 - (1 - c) * (dist - a) / (b - a);
  }

  const shotDir = new V3(), rightV = new V3(), upV = new V3(), eyeV = new V3(), endV = new V3(), muzzleV = new V3();
  function fire(f, base, targets, ads) {
    const w = WEAPONS[f.cur], gun = f.guns[f.cur];
    gun.mag--;
    f.fireCd = w.interval;
    f.lastShot = game.time;
    eyePos(f, eyeV);
    const spread = spreadOf(f, ads);
    rightV.crossVectors(base, WORLD_UP);
    if (rightV.lengthSq() < 1e-6) rightV.set(1, 0, 0);
    rightV.normalize();
    upV.crossVectors(rightV, base).normalize();
    // tracer origin roughly at the gun barrel
    muzzleV.copy(eyeV).addScaledVector(base, 0.7).addScaledVector(rightV, f.isBot ? 0.24 : 0.18 * (1 - vm.ads))
      .addScaledVector(upV, f.isBot ? -0.3 : -0.14 + 0.06 * vm.ads);

    const results = new Map();
    for (let i = 0; i < w.pellets; i++) {
      let a, th;
      if (w.pellets > 1) {
        if (i === 0) { a = 0; th = 0; } else { th = (i - 1) / (w.pellets - 1) * TAU + rand(-0.2, 0.2); a = spread * rand(0.55, 1); }
      } else {
        a = spread * Math.sqrt(Math.random());
        th = Math.random() * TAU;
      }
      const ta = Math.tan(a);
      shotDir.copy(base).addScaledVector(rightV, ta * Math.cos(th)).addScaledVector(upV, ta * Math.sin(th)).normalize();
      const wt = castWorld(eyeV, shotDir, 400);
      let hitT = wt, target = null, head = false;
      for (const tg of targets) {
        if (!tg.alive) continue;
        const h = hitTest(tg, eyeV, shotDir, hitT);
        if (h) { hitT = h.t; target = tg; head = h.head; }
      }
      endV.copy(eyeV).addScaledVector(shotDir, hitT);
      if (target) {
        let r = results.get(target);
        if (!r) { r = { dmg: 0, head: false, hits: 0, point: endV.clone() }; results.set(target, r); }
        r.dmg += w.dmg * (head ? w.head : 1) * falloff(w, hitT);
        r.head = r.head || head;
        r.hits++;
      } else if (wt < 400) {
        spawnSpark(endV);
      }
      spawnTracer(muzzleV, endV, f.isBot ? 0xff9a7a : 0xfff1b8);
    }

    if (f === player) {
      game.stats.shots += w.pellets;
      const k = ads ? 0.8 : 1;
      player.pitch = clamp(player.pitch + w.kickPitch * k * rand(0.85, 1.15), -1.5, 1.5);
      player.yaw += rand(-1, 1) * w.kickYaw * k;
      player.bloom = Math.min(w.bloomMax, player.bloom + w.bloom);
      vm.kick = 1;
      vm.flashT = 0.045;
      SFX.shot(f.cur, 1, 0);
    } else {
      if (f.model) f.model.flashT = 0.05;
      f.bloom = Math.min(w.bloomMax, f.bloom + w.bloom);
      const d = f.pos.distanceTo(player.pos);
      SFX.shot(f.cur, clamp(1.2 - d / 60, 0.25, 0.9), sidePan(f.pos));
    }

    for (const [tg, r] of results) {
      const amount = Math.max(1, Math.round(r.dmg));
      const res = applyDamage(tg, amount, f);
      if (!res) continue;
      if (f === player) {
        game.stats.hits += r.hits;
        game.stats.dmg += res.toShield + res.toHp;
        if (r.head) game.stats.heads++;
        tg.lastHitByPlayer = game.time;
        showDamageNumber(r.point, amount, res.toShield > 0, r.head);
        showHitmarker(res.killed, r.head);
        if (res.broke) SFX.shieldBreak();
        if (res.killed) { game.stats.kills++; SFX.kill(); } else SFX.hit(r.head);
      } else if (tg === player) {
        game.stats.taken += res.toShield + res.toHp;
        onPlayerHurt(f);
      }
    }
  }

  function applyDamage(tg, amount, attacker) {
    if (!tg.alive) return null;
    const toShield = Math.min(tg.shield, amount);
    tg.shield -= toShield;
    const toHp = Math.min(tg.hp, amount - toShield);
    tg.hp -= toHp;
    tg.lastHurt = game.time;
    tg.hitFlash = 0.08;
    const broke = toShield > 0 && tg.shield <= 0;
    let killed = false;
    if (tg.hp <= 0) {
      tg.hp = 0;
      killed = true;
      onKilled(tg, attacker);
    }
    return { toShield, toHp, broke, killed };
  }

  function startReload(f) {
    const w = WEAPONS[f.cur], g = f.guns[f.cur];
    if (f.reloadT > 0 || f.swapT > 0 || g.mag >= w.mag || (g.reserve <= 0 && game.mode !== 'range')) return;
    f.healing = null;
    f.reloadT = w.reload;
    if (f === player) SFX.reload();
  }

  function switchWeapon(f, k) {
    if (f.cur === k || !f.alive) return;
    f.cur = k;
    f.reloadT = 0;
    f.swapT = 0.4;
    f.healing = null;
    f.bloom = 0;
  }

  function canHeal(f, type) {
    const H = HEALS[type];
    if (f.healing || !f.alive || f.heals[type] <= 0) return false;
    if (H.shield && f.shield >= f.maxShield) return false;
    if (H.hp && f.hp >= 100) return false;
    return true;
  }
  function startHeal(f, type) {
    if (!canHeal(f, type)) return false;
    f.reloadT = 0;
    f.healing = { type, t: 0, dur: HEALS[type].time * (f.isBot ? DIFF[settings.difficulty].heal : 1) };
    return true;
  }

  function updateGunState(f, dt) {
    const w = WEAPONS[f.cur], g = f.guns[f.cur];
    f.fireCd -= dt;
    f.swapT = Math.max(0, f.swapT - dt);
    f.dashCd = Math.max(0, f.dashCd - dt);
    if (game.time - f.lastShot > 0.15) f.bloom = Math.max(0, f.bloom - dt * 0.12);
    if (f.reloadT > 0) {
      f.reloadT -= dt;
      if (f.reloadT <= 0) {
        f.reloadT = 0;
        const need = w.mag - g.mag;
        const take = game.mode === 'range' ? need : Math.min(need, g.reserve);
        g.mag += take;
        if (game.mode !== 'range') g.reserve -= take;
      }
    }
    if (f.healing) {
      f.healing.t += dt;
      if (f.healing.t >= f.healing.dur) {
        const H = HEALS[f.healing.type];
        f.shield = Math.min(f.maxShield, f.shield + H.shield);
        f.hp = Math.min(100, f.hp + H.hp);
        f.heals[f.healing.type]--;
        if (game.mode === 'range') f.heals[f.healing.type] = HEAL_LOADOUT[f.healing.type];
        f.healing = null;
        if (f === player) SFX.healDone();
      }
    }
  }

  // ------------------------------------------------------------------ movement (shared by player and bot)
  function stepMovement(f, wx, wz, speed, dt) {
    const hs = Math.hypot(f.vel.x, f.vel.z);
    if (f.dashT > 0) {
      f.dashT -= dt;
    } else if (f.sliding) {
      const ns = Math.max(0, hs - 5.5 * dt);
      if (hs > 0) { f.vel.x *= ns / hs; f.vel.z *= ns / hs; }
      f.vel.x += wx * 3 * dt;
      f.vel.z += wz * 3 * dt;
    } else if (f.onGround) {
      let dx = wx * speed - f.vel.x, dz = wz * speed - f.vel.z;
      const dl = Math.hypot(dx, dz), mx = 45 * dt;
      if (dl > mx) { dx *= mx / dl; dz *= mx / dl; }
      f.vel.x += dx;
      f.vel.z += dz;
    } else {
      f.vel.x += wx * 14 * dt;
      f.vel.z += wz * 14 * dt;
      const after = Math.hypot(f.vel.x, f.vel.z), cap = Math.max(hs, speed);
      if (after > cap) { f.vel.x *= cap / after; f.vel.z *= cap / after; }
    }
    f.vel.y -= GRAVITY * dt;
    moveAndCollide(f, dt);
  }

  function setCrouch(f, want) {
    if (want) { f.crouching = true; f.height = CROUCH_H; return; }
    if (!f.crouching) return;
    f.height = STAND_H;
    if (blocked(f, STAND_H)) { f.height = CROUCH_H; return; }
    f.crouching = false;
    f.sliding = false;
  }

  function tryDash(f, wx, wz) {
    if (f.dashCd > 0 || !f.alive) return;
    if (wx === 0 && wz === 0) { wx = -Math.sin(f.yaw); wz = -Math.cos(f.yaw); }
    f.vel.x = wx * 15;
    f.vel.z = wz * 15;
    if (f.vel.y < 1) f.vel.y = 1;
    f.dashT = 0.16;
    f.dashCd = 8;
    f.sliding = false;
    if (f === player) SFX.dash();
  }

  // ------------------------------------------------------------------ player update
  const fwdV = new V3();
  function updatePlayer(dt) {
    const p = player;
    const fighting = game.phase === 'fight';
    const canMove = p.alive && fighting;

    // weapon / item inputs
    if (canMove) {
      if (pressed.Digit1) switchWeapon(p, 'rifle');
      if (pressed.Digit2) switchWeapon(p, 'shotgun');
      if (wheel !== 0) switchWeapon(p, p.cur === 'rifle' ? 'shotgun' : 'rifle');
      if (pressed.KeyR) startReload(p);
      if (pressed.Digit3) startHeal(p, 'cell');
      if (pressed.Digit4) startHeal(p, 'syringe');
      if (pressed.Digit5) startHeal(p, 'battery');
    }
    wheel = 0;

    const ads = canMove && mouse[2] && !p.healing && p.swapT <= 0;

    // movement
    let fx = 0, fz = 0;
    if (canMove) {
      if (keys.KeyW) fz += 1;
      if (keys.KeyS) fz -= 1;
      if (keys.KeyD) fx += 1;
      if (keys.KeyA) fx -= 1;
    }
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    let wx = -sy * fz + cy * fx, wz = -cy * fz - sy * fx;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    const hs = Math.hypot(p.vel.x, p.vel.z);
    const wantCrouch = canMove && !!keys.KeyC;
    if (canMove && pressed.KeyC && p.onGround && hs > 5.5 && !p.sliding) {
      p.sliding = true;
      const boost = Math.min(hs + 2.5, 10.5);
      p.vel.x *= boost / hs;
      p.vel.z *= boost / hs;
      p.healing = null;
    }
    setCrouch(p, wantCrouch);
    if (p.sliding && (!wantCrouch || hs < 3.2)) p.sliding = false;

    const sprint = canMove && keys.ShiftLeft && fz > 0 && !ads && !p.healing && !p.crouching && !mouse[0];
    let speed = p.crouching ? SPEED.crouch : sprint ? SPEED.sprint : SPEED.walk;
    if (ads) speed *= 0.6;
    if (p.healing) speed *= 0.55;

    if (canMove && pressed.Space && p.onGround) {
      p.vel.y = JUMP_VEL;
      p.onGround = false;
      p.sliding = false;
    }
    if (canMove && pressed.KeyQ) tryDash(p, wx, wz);

    const wasAir = !p.onGround;
    const fallV = p.vel.y;
    stepMovement(p, wx, wz, speed, dt);
    if (wasAir && p.onGround && fallV < -6) SFX.land();

    // eye height follows crouch smoothly; drop to the floor on death
    const targetEye = !p.alive ? 0.35 : p.height - 0.12;
    p.eyeH += (targetEye - p.eyeH) * Math.min(1, dt * 12);

    // shooting
    updateGunState(p, dt);
    if (canMove && mouse[0]) {
      if (p.healing) {
        p.healing = null;
      } else if (p.fireCd <= 0 && p.swapT <= 0 && p.reloadT <= 0) {
        const g = p.guns[p.cur];
        if (g.mag > 0) {
          const targets = game.mode === 'duel' ? [bot] : dummies;
          fire(p, forwardOf(p.yaw, p.pitch, fwdV), targets, ads);
        } else if (g.reserve > 0 || game.mode === 'range') {
          startReload(p);
        } else if (p.fireCd <= 0) {
          SFX.empty();
          p.fireCd = 0.3;
        }
      }
    }
    if (canMove && p.guns[p.cur].mag === 0 && p.reloadT <= 0 && !p.healing && !mouse[0]) startReload(p);

    return ads;
  }

  // ------------------------------------------------------------------ bot AI
  const ai = {
    aim: new V3(), lastSeen: new V3(), hasLastSeen: false, seen: 0, lost: 0,
    strafeT: 0, strafeDir: 1, strafeOn: 1, burstLeft: 5, pauseT: 0, headAim: false,
    stuckT: 0, lastPos: new V3(), detourT: 0, detourDir: 1, wobT: 0, dashCdHurt: 0,
  };
  function resetAI() {
    ai.hasLastSeen = false;
    ai.seen = ai.lost = ai.pauseT = ai.detourT = ai.stuckT = 0;
    ai.burstLeft = 5;
    ai.lastPos.copy(bot.pos);
    headPos(player, ai.aim);
    ai.wobT = rand(0, 100);
  }

  const bEye = new V3(), pChest = new V3(), pHead = new V3(), aimP = new V3(), aimDir = new V3(), toP = new V3();
  function updateBot(dt) {
    const b = bot;
    const D = DIFF[settings.difficulty];
    const fighting = game.phase === 'fight' && b.alive;
    updateGunState(b, dt);
    if (!b.alive) { syncModel(b, dt); return; }

    eyePos(b, bEye);
    chestPos(player, pChest);
    headPos(player, pHead);
    const los = player.alive && (hasLOS(bEye, pChest) || hasLOS(bEye, pHead));
    toP.subVectors(player.pos, b.pos);
    toP.y = 0;
    const dist = Math.max(0.01, toP.length());
    if (los) { ai.seen += dt; ai.lost = 0; ai.lastSeen.copy(player.pos); ai.hasLastSeen = true; }
    else { ai.seen = 0; ai.lost += dt; }

    // aim: a point that chases the player's chest/head with some lag and wobble
    const target = ai.headAim ? pHead : pChest;
    if (los) {
      const k = 1 - Math.exp(-D.track * dt);
      ai.aim.lerp(target, k);
    } else if (ai.hasLastSeen) {
      ai.aim.lerp(aimP.set(ai.lastSeen.x, ai.lastSeen.y + 1.1, ai.lastSeen.z), 1 - Math.exp(-3 * dt));
    }
    ai.wobT += dt;
    const wob = D.wobble * (0.6 + dist / 30);
    aimP.copy(ai.aim).add(projV.set(Math.sin(ai.wobT * 3.1) * wob, Math.sin(ai.wobT * 2.3 + 1) * wob * 0.7, Math.cos(ai.wobT * 2.7) * wob));
    aimDir.subVectors(aimP, bEye).normalize();
    b.yaw = Math.atan2(-aimDir.x, -aimDir.z);
    b.pitch = Math.asin(clamp(aimDir.y, -1, 1));

    if (fighting) {
      // weapon choice: scattergun up close, carbine otherwise
      const want = dist < 9 ? 'shotgun' : 'rifle';
      if (want !== b.cur && b.swapT <= 0 && !b.healing) {
        if (b.guns[want].mag > 0 || b.guns[want].reserve > 0) switchWeapon(b, want);
      }
      // heal when out of sight
      if (!b.healing && !los && ai.lost > 0.8) {
        if (b.shield <= 40) startHeal(b, 'battery');
        if (!b.healing && b.shield < 100) startHeal(b, 'cell');
        if (!b.healing && b.hp < 70) startHeal(b, 'syringe');
      }
      if (b.healing && los && ai.seen > 0.25) b.healing = null;
      // reload
      const g = b.guns[b.cur];
      if (g.mag === 0) startReload(b);
      else if (!los && ai.lost > 0.5 && g.mag < WEAPONS[b.cur].mag * 0.5 && !b.healing) startReload(b);
    }

    // movement
    let wx = 0, wz = 0, speed = SPEED.walk, jump = false, crouch = false;
    if (fighting && !b.healing) {
      if (los) {
        ai.strafeT -= dt;
        if (ai.strafeT <= 0) {
          ai.strafeDir = Math.random() < 0.5 ? -1 : 1;
          ai.strafeOn = Math.random() < D.strafe ? 1 : 0;
          ai.strafeT = rand(0.25, 0.8);
          if (Math.random() < D.jump) jump = true;
        }
        const fx = toP.x / dist, fz = toP.z / dist;
        const prefer = b.cur === 'shotgun' ? 3 : (player.shield <= 0 ? 8 : 16);
        let radial = 0;
        if (dist > prefer + 4) radial = 1;
        else if (dist < prefer - 4) radial = -0.6;
        wx = fx * radial - fz * ai.strafeDir * ai.strafeOn;
        wz = fz * radial + fx * ai.strafeDir * ai.strafeOn;
        // hard bots dodge with a dash when their shield cracks
        if (settings.difficulty === 'hard' && b.shield <= 0 && game.time - b.lastHurt < 0.2 && b.dashCd <= 0) {
          tryDash(b, -fz * ai.strafeDir, fx * ai.strafeDir);
        }
      } else {
        const tgt = (ai.hasLastSeen && ai.lost < 4) ? ai.lastSeen : player.pos;
        const dx = tgt.x - b.pos.x, dz = tgt.z - b.pos.z, dl = Math.hypot(dx, dz);
        if (dl < 1.5) ai.hasLastSeen = false;
        else { wx = dx / dl; wz = dz / dl; if (dl > 6) speed = SPEED.sprint; }
      }
    } else if (b.healing) {
      crouch = true;
    }
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    // stuck detection: detour sideways and hop
    ai.stuckT += dt;
    if (ai.stuckT > 0.6) {
      if (wl > 0 && ai.detourT <= 0 && b.pos.distanceTo(ai.lastPos) < 0.6) {
        ai.detourT = rand(0.6, 1.1);
        ai.detourDir = Math.random() < 0.5 ? -1 : 1;
        jump = true;
      }
      ai.lastPos.copy(b.pos);
      ai.stuckT = 0;
    }
    if (ai.detourT > 0 && wl > 0) {
      ai.detourT -= dt;
      const ox = wx;
      wx = -wz * ai.detourDir * 0.9 + wx * 0.3;
      wz = ox * ai.detourDir * 0.9 + wz * 0.3;
    }

    setCrouch(b, crouch);
    if (jump && b.onGround) b.vel.y = JUMP_VEL;
    stepMovement(b, wx, wz, speed, dt);
    b.eyeH = b.height - 0.12;

    // firing
    if (fighting && los && ai.seen > D.reaction && !b.healing && b.reloadT <= 0 && b.swapT <= 0 && b.fireCd <= 0) {
      const g = b.guns[b.cur];
      if (ai.pauseT > 0) {
        ai.pauseT -= dt;
      } else if (g.mag > 0 && (b.cur === 'rifle' || dist < 14)) {
        fire(b, aimDir, [player], dist > 10);
        if (b.cur === 'rifle' && --ai.burstLeft <= 0) {
          ai.pauseT = rand(D.pause[0], D.pause[1]);
          ai.burstLeft = randInt(D.burst[0], D.burst[1]);
          ai.headAim = Math.random() < D.head;
        }
      }
    } else if (ai.pauseT > 0) {
      ai.pauseT -= dt;
    }
    syncModel(b, dt);
  }

  // ------------------------------------------------------------------ firing range dummies
  function spawnDummies() {
    for (const d of dummies) scene.remove(d.model.group);
    dummies = RANGE_DUMMIES.map((def) => {
      const f = makeFighter(true);
      f.model = buildHumanoid(0x8d99a6, 0xff5a3c);
      f.def = def;
      f.respawnT = 0;
      resetFighter(f, def.x, def.z, Math.PI / 2);
      if (def.crouch) setCrouch(f, true);
      return f;
    });
  }
  function updateDummies(dt) {
    for (const f of dummies) {
      const def = f.def;
      if (!f.alive) {
        f.respawnT -= dt;
        if (f.respawnT <= 0) {
          resetFighter(f, def.x, def.z, 0);
          if (def.crouch) setCrouch(f, true);
        }
      } else {
        const z = def.amp ? def.z + Math.sin(game.time * def.speed) * def.amp : def.z;
        f.vel.set(0, 0, (z - f.pos.z) / Math.max(dt, 1e-4));
        f.pos.z = z;
        if (game.time - f.lastHurt > 3) { f.shield = f.maxShield; f.hp = 100; }
      }
      f.yaw = Math.atan2(-(player.pos.x - f.pos.x), -(player.pos.z - f.pos.z));
      syncModel(f, dt);
    }
  }

  // ------------------------------------------------------------------ rounds & flow
  function onKilled(victim) {
    victim.alive = false;
    victim.healing = null;
    victim.deathT = 0;
    if (game.mode === 'range') { victim.respawnT = 2; return; }
    if (game.phase !== 'fight') return;
    const playerWon = victim === bot;
    game.score[playerWon ? 0 : 1]++;
    game.phase = 'roundEnd';
    game.phaseT = 3.2;
    const over = game.score[0] >= WIN_ROUNDS || game.score[1] >= WIN_ROUNDS;
    showCenter(playerWon ? 'ROUND WON' : 'ELIMINATED', over ? 'MATCH POINT DECIDED' : `${game.score[0]} — ${game.score[1]}`, 3);
  }

  function onPlayerHurt(attacker) {
    hurt.flash = 0.35;
    hurt.dirT = 1.2;
    hurt.from.copy(attacker.pos);
    SFX.hurt();
  }

  function startRound() {
    const [a, b] = DUEL_SPAWNS;
    const swap = game.round % 2 === 0;
    const ps = swap ? b : a, bs = swap ? a : b;
    resetFighter(player, ps.x, ps.z, ps.yaw);
    resetFighter(bot, bs.x, bs.z, bs.yaw);
    resetAI();
    game.phase = 'countdown';
    game.phaseT = 3;
    game.lastBeep = 4;
    $('roundLbl').textContent = `ROUND ${game.round} · FIRST TO ${WIN_ROUNDS}`;
    showCenter(`ROUND ${game.round}`, 'GET READY', 3);
  }

  function startMode(mode) {
    initAudio();
    if (document.activeElement) document.activeElement.blur();
    game.mode = mode;
    game.active = true;
    game.ended = false;
    game.paused = false;
    game.time = 0;
    game.stats = freshStats();
    $('menu').classList.add('hidden');
    $('end').classList.add('hidden');
    $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('score').classList.toggle('hidden', mode !== 'duel');
    $('rangeStats').classList.toggle('hidden', mode !== 'range');
    if (mode === 'duel') {
      buildDuelMap();
      for (const d of dummies) scene.remove(d.model.group);
      dummies = [];
      bot.model.group.visible = true;
      game.score = [0, 0];
      game.round = 1;
      startRound();
    } else {
      buildRangeMap();
      bot.model.group.visible = false;
      bot.alive = false;
      resetFighter(player, RANGE_SPAWN.x, RANGE_SPAWN.z, RANGE_SPAWN.yaw);
      spawnDummies();
      game.phase = 'fight';
      showCenter('FIRING RANGE', 'ESC TO PAUSE', 2);
    }
    requestLock();
  }

  function endMatch() {
    game.ended = true;
    game.active = false;
    game.phase = 'menu';
    const won = game.score[0] > game.score[1];
    const s = game.stats;
    $('endTitle').textContent = won ? 'VICTORY' : 'DEFEAT';
    $('endTitle').style.color = won ? '#ffd23f' : '#da292a';
    $('endSub').textContent = `${game.score[0]} — ${game.score[1]} vs ${settings.difficulty} bot`;
    const acc = s.shots ? Math.round(100 * s.hits / s.shots) : 0;
    $('endStats').innerHTML = [
      ['DAMAGE DEALT', s.dmg], ['DAMAGE TAKEN', s.taken], ['ACCURACY', acc + '%'], ['HEADSHOTS', s.heads], ['KNOCKS', s.kills],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('end').classList.remove('hidden');
    $('hud').classList.add('hidden');
    if (document.exitPointerLock) document.exitPointerLock();
  }

  function quitToMenu() {
    game.active = false;
    game.ended = false;
    game.paused = false;
    game.phase = 'menu';
    $('pause').classList.add('hidden');
    $('end').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('settingsHome').appendChild($('settings'));
    if (document.exitPointerLock && locked()) document.exitPointerLock();
  }

  function setPaused(v) {
    game.paused = v;
    $('pause').classList.toggle('hidden', !v);
    if (v) {
      $('settingsPause').appendChild($('settings'));
      mouse.fill(false);
      for (const k in keys) keys[k] = false;
    }
  }

  function updateFlow(dt) {
    if (game.mode !== 'duel') return;
    if (game.phase === 'countdown') {
      game.phaseT -= dt;
      const n = Math.ceil(game.phaseT);
      if (n !== game.lastBeep && n > 0) { game.lastBeep = n; SFX.beep(false); showCenter(String(n), `ROUND ${game.round}`, 1); }
      if (game.phaseT <= 0) { game.phase = 'fight'; SFX.beep(true); showCenter('FIGHT', '', 0.8); }
    } else if (game.phase === 'roundEnd') {
      game.phaseT -= dt;
      if (game.phaseT <= 0) {
        if (game.score[0] >= WIN_ROUNDS || game.score[1] >= WIN_ROUNDS) endMatch();
        else { game.round++; startRound(); }
      }
    }
  }

  // ------------------------------------------------------------------ HUD
  const hud = {
    centerT: 0, hitT: 0,
    el: {
      center: $('center'), big: $('centerBig'), sub: $('centerSub'), hit: $('hitmarker'), cross: $('crosshair'),
      pShield: $('pShield'), pHp: $('pHp'), pShieldNum: $('pShieldNum'), pHpNum: $('pHpNum'), pHpBar: $('pHpBar'),
      ammo: $('ammo'), wname: $('wname'), slot1: $('slot1'), slot2: $('slot2'),
      itCell: $('itCell'), itSyr: $('itSyr'), itBat: $('itBat'), tac: $('tac'),
      healProg: $('healProg'), healName: $('healName'), healFill: $('healFill'),
      enemy: $('enemy'), eShield: $('eShield'), eHp: $('eHp'), enemyName: $('enemyName'),
      scoreMe: $('scoreMe'), scoreBot: $('scoreBot'), dmgDir: $('dmgDir'), hurtFlash: $('hurtFlash'), lowHp: $('lowHp'),
      fps: $('fps'), rsDmg: $('rsDmg'), rsAcc: $('rsAcc'), rsHead: $('rsHead'), rsKills: $('rsKills'),
    },
  };
  const hurt = { flash: 0, dirT: 0, from: new V3() };

  function showCenter(big, sub, dur) {
    hud.el.big.textContent = big;
    hud.el.sub.textContent = sub;
    hud.centerT = dur;
  }
  function showHitmarker(kill, head) {
    hud.el.hit.className = kill ? 'kill' : head ? 'head' : '';
    hud.hitT = kill ? 0.4 : 0.15;
  }
  function sidePan(pos) {
    const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    const l = Math.hypot(dx, dz) || 1;
    return (dx * rx + dz * rz) / l * 0.8;
  }

  const setW = (el, pct) => { el.style.width = clamp(pct, 0, 100) + '%'; };
  let fpsAcc = 0, fpsN = 0;
  function updateHUD(dt, ads) {
    const e = hud.el, p = player;
    hud.centerT -= dt;
    e.center.style.opacity = clamp(hud.centerT / 0.3, 0, 1);
    hud.hitT -= dt;
    e.hit.style.opacity = hud.hitT > 0 ? 1 : 0;

    setW(e.pShield, p.shield);
    setW(e.pHp, p.hp);
    e.pShieldNum.textContent = Math.ceil(p.shield);
    e.pHpNum.textContent = Math.ceil(p.hp);
    e.pHpBar.classList.toggle('low', p.hp <= 30);

    const g = p.guns[p.cur];
    e.ammo.innerHTML = `${g.mag}<small> / ${game.mode === 'range' ? '∞' : g.reserve}</small>`;
    e.ammo.classList.toggle('empty', g.mag === 0);
    e.wname.textContent = p.reloadT > 0 ? 'RELOADING…' : WEAPONS[p.cur].name;
    e.slot1.classList.toggle('on', p.cur === 'rifle');
    e.slot2.classList.toggle('on', p.cur === 'shotgun');
    const items = [[e.itCell, 'cell'], [e.itSyr, 'syringe'], [e.itBat, 'battery']];
    for (const [el, k] of items) {
      el.querySelector('b').textContent = game.mode === 'range' ? '∞' : p.heals[k];
      el.classList.toggle('none', p.heals[k] <= 0);
    }
    e.tac.classList.toggle('cd', p.dashCd > 0);
    e.tac.innerHTML = p.dashCd > 0 ? `<em>Q</em>DASH ${Math.ceil(p.dashCd)}s` : '<em>Q</em>DASH';

    if (p.healing) {
      e.healProg.classList.remove('hidden');
      e.healName.textContent = 'USING ' + HEALS[p.healing.type].name;
      setW(e.healFill, 100 * p.healing.t / p.healing.dur);
    } else e.healProg.classList.add('hidden');

    // crosshair gap follows the real spread
    e.cross.className = ads ? 'ads' : (p.healing || !p.alive || p.sliding ? 'off' : '');
    const gap = 3 + Math.tan(spreadOf(p, false)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (innerHeight / 2);
    const lines = e.cross.children;
    lines[0].style.top = (-gap - 8) + 'px';
    lines[1].style.top = gap + 'px';
    lines[2].style.left = (-gap - 8) + 'px';
    lines[3].style.left = gap + 'px';

    // enemy bar: shows the target you last hit
    let tg = null;
    if (game.mode === 'duel') { if (game.time - bot.lastHitByPlayer < 4 || game.phase === 'roundEnd') tg = bot; }
    else {
      for (const d of dummies) if (game.time - d.lastHitByPlayer < 4 && (!tg || d.lastHitByPlayer > tg.lastHitByPlayer)) tg = d;
    }
    e.enemy.classList.toggle('hidden', !tg);
    if (tg) {
      e.enemyName.textContent = !tg.alive ? 'KNOCKED' : (game.mode === 'duel' ? `BOT · ${settings.difficulty.toUpperCase()}` : 'DUMMY');
      setW(e.eShield, tg.shield);
      setW(e.eHp, tg.hp);
    }

    if (game.mode === 'duel') {
      e.scoreMe.textContent = game.score[0];
      e.scoreBot.textContent = game.score[1];
    } else {
      const s = game.stats;
      e.rsDmg.textContent = s.dmg;
      e.rsAcc.textContent = (s.shots ? Math.round(100 * s.hits / s.shots) : 0) + '%';
      e.rsHead.textContent = s.heads;
      e.rsKills.textContent = s.kills;
    }

    // damage direction + screen flash
    hurt.flash = Math.max(0, hurt.flash - dt);
    hurt.dirT = Math.max(0, hurt.dirT - dt);
    e.hurtFlash.style.opacity = hurt.flash / 0.35 * 0.8;
    e.lowHp.style.opacity = p.alive && p.hp < 40 ? (1 - p.hp / 40) * 0.9 : 0;
    if (hurt.dirT > 0) {
      const dx = hurt.from.x - p.pos.x, dz = hurt.from.z - p.pos.z;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      e.dmgDir.style.transform = `rotate(${ang}rad)`;
    }
    e.dmgDir.style.opacity = clamp(hurt.dirT / 0.4, 0, 1);

    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { e.fps.textContent = Math.round(fpsN / fpsAcc) + ' FPS'; fpsAcc = 0; fpsN = 0; }
  }

  // ------------------------------------------------------------------ main loop
  let lastAds = false;
  function update(dt) {
    game.time += dt;
    updateFlow(dt);
    lastAds = updatePlayer(dt);
    if (game.mode === 'duel') updateBot(dt);
    else {
      updateDummies(dt);
      if (pressed.KeyT) game.stats = freshStats();
    }
    updateEffects(dt);
    updateViewmodel(dt, lastAds);
    updateHUD(dt, lastAds);
  }

  function updateCamera(dt) {
    const p = player;
    camera.position.set(p.pos.x, p.pos.y + p.eyeH, p.pos.z);
    camera.rotation.set(p.pitch, p.yaw, !p.alive ? 0.4 : (p.sliding ? 0.04 : 0));
    const aspect = innerWidth / innerHeight;
    const hfov = THREE.MathUtils.degToRad(settings.fov);
    let vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
    vfov = THREE.MathUtils.radToDeg(vfov);
    const zoom = 1 - (1 - WEAPONS[p.cur].zoom) * vm.ads;
    const sprintFov = Math.hypot(p.vel.x, p.vel.z) > 6.5 && p.onGround ? 1.04 : 1;
    const target = vfov * zoom * sprintFov;
    const fov = camera.fov + (target - camera.fov) * Math.min(1, dt * 12);
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  let last = performance.now();
  let menuT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.active && !game.paused) update(dt);
    for (const k in pressed) pressed[k] = false;

    if (game.active) {
      updateCamera(dt);
    } else if (!game.ended) {
      // slow orbit behind the menu
      menuT += dt * 0.06;
      camera.position.set(Math.cos(menuT) * 30, 11, Math.sin(menuT) * 22);
      camera.lookAt(0, 1, 0);
    }
    renderer.clear();
    renderer.render(scene, camera);
    if (game.active && player.alive) {
      renderer.clearDepth();
      renderer.render(vmScene, vmCam);
    }
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = vmCam.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    vmCam.updateProjectionMatrix();
  });

  // ------------------------------------------------------------------ menus
  function bindSlider(id, out, key, fmt) {
    const el = $(id), o = $(out);
    el.value = settings[key];
    o.textContent = fmt(settings[key]);
    el.addEventListener('input', () => {
      settings[key] = parseFloat(el.value);
      o.textContent = fmt(settings[key]);
      if (key === 'volume' && master) master.gain.value = settings.volume;
      saveSettings();
    });
  }
  bindSlider('sSens', 'oSens', 'sens', (v) => v.toFixed(2));
  bindSlider('sAds', 'oAds', 'adsSens', (v) => v.toFixed(2));
  bindSlider('sFov', 'oFov', 'fov', (v) => String(Math.round(v)));
  bindSlider('sVol', 'oVol', 'volume', (v) => Math.round(v * 100) + '%');

  function bindSeg(segId, attr, key, onChange) {
    const btns = $(segId).querySelectorAll('button');
    const paint = () => btns.forEach((b) => b.classList.toggle('on', b.dataset[attr] === settings[key]));
    btns.forEach((b) => b.addEventListener('click', () => { settings[key] = b.dataset[attr]; paint(); saveSettings(); if (onChange) onChange(); }));
    paint();
  }
  bindSeg('diffSeg', 'diff', 'difficulty');
  bindSeg('gfxSeg', 'gfx', 'gfx', applyGraphics);

  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => startMode(b.dataset.mode)));
  $('btnResume').addEventListener('click', () => { initAudio(); requestLock(); });
  $('btnRestart').addEventListener('click', () => startMode(game.mode));
  $('btnQuit').addEventListener('click', quitToMenu);
  $('btnRematch').addEventListener('click', () => startMode('duel'));
  $('btnMenu').addEventListener('click', quitToMenu);

  // menu backdrop: show the arena with the bot standing in it
  applyGraphics();
  buildDuelMap();
  resetFighter(bot, 6, 4, 2.2);
  bot.model.group.visible = true;
  syncModel(bot, 0);
  requestAnimationFrame(frame);

  // small hook for automated testing
  window.__arena = {
    game, player, bot, startMode, setPaused, keys, pressed, mouse, settings, dummies: () => dummies,
    step(n, dt = 1 / 60, each) { for (let i = 0; i < n && game.active; i++) { if (each) each(); update(dt); for (const k in pressed) pressed[k] = false; } },
  };
})();
