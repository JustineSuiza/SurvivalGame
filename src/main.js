import * as THREE from "three";
import "./style.css";
import { heightAt, slopeAt, WATER_LEVEL, fbm, smoothstep } from "./terrain.js";
import { ITEMS } from "./items.js";
import {
  initAudio,
  resumeAudio,
  toggleMute,
  updateAmbience,
  updateMusic,
  playClick,
  playStep,
  playJump,
  playLand,
  playSplash,
  playBreath,
  playDeerCall,
  playSwing,
  playHit,
  playHurt,
  playGrowl,
  playWolfAttack,
  playChop,
  playMine,
  playTreeFall,
  playRockBreak,
  playGrunt,
  playChargeReady,
} from "./audio.js";
import {
  loadout,
  addItem,
  getStats,
  toast,
  initInventory,
  toggleBackpack,
  isOpen as backpackOpen,
  onBackpackToggle,
  useHotbarItem,
  giveStartingKit,
  buildItemMesh,
} from "./inventory.js";
import {
  settings,
  initMenus,
  showPause,
  hidePause,
  showDeath,
  hideDeath,
} from "./menus.js";

const MAP_HALF = 1000;
const WALK_LIMIT = 962;
const DAY_LENGTH = 300;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9dc6ea, 70, 850);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 4000);
const eyeRig = new THREE.Object3D();
eyeRig.add(camera);
scene.add(eyeRig);

const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a4030, 0.6);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff2d0, 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0015;
scene.add(sun);
scene.add(sun.target);

const moon = new THREE.DirectionalLight(0x9db9ff, 0);
scene.add(moon);
scene.add(moon.target);

const sunDisc = new THREE.Mesh(
  new THREE.SphereGeometry(42, 20, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false })
);
const moonDisc = new THREE.Mesh(
  new THREE.SphereGeometry(28, 20, 16),
  new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false })
);
scene.add(sunDisc, moonDisc);

const C = {
  sandA: new THREE.Color(0xd9c795),
  sandB: new THREE.Color(0xbfa87a),
  grassA: new THREE.Color(0x4e7f36),
  grassB: new THREE.Color(0x37642a),
  dryA: new THREE.Color(0x8a9450),
  rockA: new THREE.Color(0x6f6a62),
  rockB: new THREE.Color(0x514d47),
  snow: new THREE.Color(0xf2f6fa),
};

function terrainColor(h, sl, x, z) {
  const c = new THREE.Color();
  const n = fbm(x * 0.01 + 40, z * 0.01 + 40, 3);
  if (h < 1.4) {
    c.copy(C.sandA).lerp(C.sandB, smoothstep(-14, 1.4, h));
  } else if (h < 44) {
    const g = C.grassA.clone().lerp(C.grassB, n);
    if (n > 0.62) g.lerp(C.dryA, (n - 0.62) * 1.9);
    c.copy(C.sandA).lerp(g, smoothstep(1.4, 6, h));
    if (h > 30) c.lerp(C.rockA, smoothstep(30, 44, h) * 0.7);
  } else if (h < 68) {
    c.copy(C.rockA).lerp(C.rockB, n);
    c.lerp(C.grassB, Math.max(0, 1 - smoothstep(44, 58, h)) * 0.5);
  } else {
    c.copy(C.rockB).lerp(C.snow, smoothstep(68, 82, h));
  }
  if (sl > 0.55) {
    const rocky = C.rockB.clone().lerp(C.rockA, n);
    c.lerp(rocky, smoothstep(0.55, 1.0, sl) * 0.85);
  }
  return c;
}

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(MAP_HALF * 2, MAP_HALF * 2, 176, 176);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  const flat = geo.toNonIndexed();
  const p = flat.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let f = 0; f < p.count; f += 3) {
    const x = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
    const z = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
    const h = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const col = terrainColor(h, slopeAt(x, z), x, z);
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 3] = col.r;
      colors[(f + v) * 3 + 1] = col.g;
      colors[(f + v) * 3 + 2] = col.b;
    }
  }
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  const mesh = new THREE.Mesh(
    flat,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  );
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);
}
buildTerrain();

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_HALF * 3, MAP_HALF * 3).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({
    color: 0x2f76b0,
    transparent: true,
    opacity: 0.8,
    roughness: 0.12,
    metalness: 0.35,
  })
);
water.position.y = WATER_LEVEL;
scene.add(water);

const obstacles = [];
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

function sampleSpot(minH, maxH, maxSlope) {
  for (let k = 0; k < 50; k++) {
    const x = (Math.random() * 2 - 1) * (MAP_HALF - 40);
    const z = (Math.random() * 2 - 1) * (MAP_HALF - 40);
    const h = heightAt(x, z);
    if (h >= minH && h <= maxH && slopeAt(x, z) <= maxSlope) return { x, z, h };
  }
  return null;
}

function place(mesh, i, x, h, z, scale, rotY, flat = false) {
  tmpQ.setFromEuler(new THREE.Euler(0, rotY, 0));
  tmpS.set(scale.x ?? scale, scale.y ?? scale, scale.z ?? scale);
  tmpM.compose(tmpV.set(x, h, z), tmpQ, tmpS);
  if (flat) tmpM.multiply(new THREE.Matrix4().makeTranslation(0, scale.lift ?? 0, 0));
  mesh.setMatrixAt(i, tmpM);
}

const trees = [];
const rocks = [];
let treeMeshes = null;
let rockMesh = null;
const harvestFx = new Set();

function scatterTrees() {
  const count = 620;
  const trunkGeo = new THREE.CylinderGeometry(0.26, 0.5, 5, 6).translate(0, 2.5, 0);
  const lowGeo = new THREE.ConeGeometry(3.1, 6.4, 7).translate(0, 5.4, 0);
  const topGeo = new THREE.ConeGeometry(2, 5.4, 7).translate(0, 8.6, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, mat, count);
  const lows = new THREE.InstancedMesh(lowGeo, mat, count);
  const tops = new THREE.InstancedMesh(topGeo, mat, count);
  trunks.castShadow = lows.castShadow = tops.castShadow = true;
  trunks.receiveShadow = lows.receiveShadow = true;
  let n = 0;
  const col = new THREE.Color();
  while (n < count) {
    const s = sampleSpot(2, 46, 0.55);
    if (!s) break;
    const sc = 0.7 + Math.random() * 0.9;
    const rotY = Math.random() * 6.28;
    place(trunks, n, s.x, s.h, s.z, sc, rotY);
    place(lows, n, s.x, s.h, s.z, sc, rotY);
    place(tops, n, s.x, s.h, s.z, sc, rotY);
    const g = 0.75 + Math.random() * 0.5;
    col.setRGB(0.16 * g, (0.34 + Math.random() * 0.14) * g, 0.12 * g);
    if (Math.random() < 0.22) col.setRGB(0.13 * g, 0.3 * g, 0.2 * g);
    lows.setColorAt(n, col);
    tops.setColorAt(n, col.clone().multiplyScalar(1.15));
    trunks.setColorAt(n, new THREE.Color().setRGB(0.32 + Math.random() * 0.1, 0.22, 0.14));
    const obstacle = { x: s.x, z: s.z, r: 0.5 * sc };
    obstacles.push(obstacle);
    trees.push({
      kind: "tree",
      idx: n,
      x: s.x,
      h: s.h,
      z: s.z,
      sc,
      rotY,
      hp: 75,
      maxHp: 75,
      state: "alive",
      t: 0,
      shake: 0,
      wp: Math.random() * 6.283,
      wv: 0.7 + Math.random() * 0.7,
      obstacle,
    });
    n++;
  }
  trunks.count = lows.count = tops.count = n;
  trunks.instanceMatrix.needsUpdate = true;
  lows.instanceMatrix.needsUpdate = true;
  tops.instanceMatrix.needsUpdate = true;
  scene.add(trunks, lows, tops);
  treeMeshes = { trunks, lows, tops };
}

function scatterRocks() {
  const count = 320;
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    count
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  let n = 0;
  while (n < count) {
    const s = sampleSpot(-6, 95, 1.3);
    if (!s) break;
    const sc = { x: 0.6 + Math.random() * 2.2, y: 0.5 + Math.random() * 1.6, z: 0.6 + Math.random() * 2.2 };
    const rx = Math.random() * 3;
    const ry = Math.random() * 6;
    const rz = Math.random() * 3;
    tmpQ.setFromEuler(new THREE.Euler(rx, ry, rz));
    tmpS.set(sc.x, sc.y, sc.z);
    tmpM.compose(tmpV.set(s.x, s.h + sc.y * 0.25, s.z), tmpQ, tmpS);
    mesh.setMatrixAt(n, tmpM);
    const v = 0.45 + Math.random() * 0.28;
    mesh.setColorAt(n, new THREE.Color().setRGB(v, v * 0.97, v * 0.9));
    const obstacle = { x: s.x, z: s.z, r: Math.max(sc.x, sc.z) * 0.9 };
    obstacles.push(obstacle);
    rocks.push({
      kind: "rock",
      idx: n,
      x: s.x,
      y: s.h + sc.y * 0.25,
      z: s.z,
      sc: { ...sc },
      rx,
      ry,
      rz,
      hp: 60,
      maxHp: 60,
      state: "alive",
      t: 0,
      shake: 0,
      obstacle,
    });
    n++;
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  rockMesh = mesh;
}

function scatterGrass() {
  const count = 7000;
  const geo = new THREE.ConeGeometry(0.16, 1.1, 3).translate(0, 0.55, 0);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    count
  );
  let n = 0;
  const col = new THREE.Color();
  while (n < count) {
    const s = sampleSpot(1.5, 38, 0.7);
    if (!s) break;
    place(mesh, n, s.x, s.h, s.z, { x: 1 + Math.random(), y: 0.7 + Math.random() * 1.3, z: 1 + Math.random() }, Math.random() * 6.28);
    const g = 0.7 + Math.random() * 0.6;
    col.setRGB(0.22 * g, (0.5 + Math.random() * 0.3) * g, 0.18 * g);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

function scatterBushes() {
  const count = 340;
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    count
  );
  mesh.castShadow = true;
  let n = 0;
  while (n < count) {
    const s = sampleSpot(1.5, 40, 0.7);
    if (!s) break;
    const sc = 0.8 + Math.random() * 1.7;
    place(mesh, n, s.x, s.h, s.z, { x: sc, y: sc * 0.7, z: sc }, Math.random() * 6.28);
    const g = 0.7 + Math.random() * 0.6;
    mesh.setColorAt(n, new THREE.Color().setRGB(0.16 * g, 0.36 * g, 0.14 * g));
    n++;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
}

scatterTrees();
scatterRocks();
scatterGrass();
scatterBushes();

const clouds = [];
{
  const geo = new THREE.SphereGeometry(1, 8, 6);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 4);
    for (let p = 0; p < puffs; p++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 34);
      const s = 12 + Math.random() * 18;
      m.scale.set(s, s * 0.55, s * 0.8);
      g.add(m);
    }
    g.position.set((Math.random() - 0.5) * 2600, 170 + Math.random() * 110, (Math.random() - 0.5) * 2600);
    scene.add(g);
    clouds.push({ g, speed: 2 + Math.random() * 4 });
  }
}

function makeBeast(opts = {}) {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: opts.fur ?? 0x9a6a3c, roughness: 1, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: opts.dark ?? 0x5e3f22, roughness: 1, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.65), fur);
  body.position.y = 1.15;
  body.castShadow = true;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.7, 0.3), fur);
  neck.position.set(0.7, 1.6, 0);
  neck.rotation.z = -0.35;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.35), fur);
  head.position.set(0.95, 1.95, 0);
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.12), dark);
  earL.position.set(0.8, 2.2, 0.16);
  const earR = earL.clone();
  earR.position.z = -0.16;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.2), dark);
  snout.position.set(1.2, 1.88, 0);
  g.add(body, neck, head, earL, earR, snout);
  const legs = [];
  const legGeo = new THREE.BoxGeometry(0.16, 1.1, 0.16).translate(0, -0.55, 0);
  const lp = [
    [0.55, 0.85],
    [0.55, -0.85],
    [-0.55, 0.85],
    [-0.55, -0.85],
  ];
  for (const [x, z] of lp) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.1, z);
    const leg = new THREE.Mesh(legGeo, dark);
    leg.castShadow = true;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.18), dark);
  tail.position.set(-0.8, 1.35, 0);
  g.add(tail);
  if (opts.scale) g.scale.setScalar(opts.scale);
  return { g, legs, head };
}

const creatures = [];

function spawnCreature(kind, s) {
  const wolf = kind === "wolf";
  const d = makeBeast(wolf ? { fur: 0x5a6068, dark: 0x33373d, scale: 0.95 } : {});
  d.g.position.set(s.x, s.h, s.z);
  scene.add(d.g);
  creatures.push({
    ...d,
    kind,
    name: wolf ? "Wolf" : "Deer",
    hostile: wolf,
    hp: wolf ? 65 : 45,
    baseY: s.h,
    angle: Math.random() * 6.28,
    speed: 0,
    timer: Math.random() * 3,
    phase: Math.random() * 6,
    panic: 0,
    aggro: false,
    atkCd: 0,
    growlCd: 2 + Math.random() * 4,
  });
}

for (let i = 0; i < 13; i++) {
  const s = sampleSpot(2, 40, 0.6);
  if (s) spawnCreature("deer", s);
}
for (let i = 0; i < 7; i++) {
  const s = sampleSpot(3, 45, 0.7);
  if (s) spawnCreature("wolf", s);
}

const spawn = { x: 0, z: 40 };
{
  let best = null;
  for (let i = 0; i < 400; i++) {
    const x = (Math.random() * 2 - 1) * 120;
    const z = (Math.random() * 2 - 1) * 120;
    const h = heightAt(x, z);
    if (h > 3 && h < 35 && slopeAt(x, z) < 0.4) {
      if (!best || Math.abs(h - 8) < Math.abs(best.h - 8)) best = { x, z, h };
    }
  }
  if (best) Object.assign(spawn, best);
}

const player = {
  pos: new THREE.Vector3(spawn.x, Math.max(heightAt(spawn.x, spawn.z), WATER_LEVEL + 0.2), spawn.z),
  vel: new THREE.Vector3(),
  yaw: Math.random() * 6.28,
  pitch: -0.06,
  onGround: false,
  swimming: false,
  stamina: 100,
  sprinting: false,
  exhausted: false,
  crouch: false,
  bobPhase: 0,
  bobAmp: 0,
  landDip: 0,
  lastStep: null,
  breathTimer: 0,
  radius: 0.42,
};

function surfaceAt(x, z) {
  if (player.swimming) return "water";
  const h = heightAt(x, z);
  if (h < 1.4) return "sand";
  if (h > 66) return "snow";
  if (h > 46 || slopeAt(x, z) > 0.75) return "stone";
  return "grass";
}

const view = new THREE.Group();
camera.add(view);

const skin = new THREE.MeshStandardMaterial({ color: 0xd9a06b, roughness: 0.85 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x39527a, roughness: 0.9 });
const metal = new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.4, metalness: 0.7 });
const glass = new THREE.MeshStandardMaterial({ color: 0xffd88a, emissive: 0xffb545, emissiveIntensity: 2.4, roughness: 0.3 });

function arm(sx) {
  const g = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.115, 0.21), sleeve);
  upper.position.z = -0.105;
  const elbow = new THREE.Group();
  elbow.position.z = -0.21;
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.18), sleeve);
  fore.position.z = -0.09;
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), skin);
  hand.position.z = -0.25;
  elbow.add(fore, hand);
  g.add(upper, elbow);
  g.position.set(sx, -0.34, -0.55);
  g.rotation.x = -0.15;
  g.rotation.y = -sx * 0.5;
  g.userData.elbow = elbow;
  return g;
}

const armL = arm(-0.26);
const armR = arm(0.26);
const handR = armR.userData.elbow;
view.add(armL, armR);

const bodyCloth2 = new THREE.MeshStandardMaterial({ color: 0x2c3f5e, roughness: 0.9 });
const bodyDark = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });

const fpBody = new THREE.Group();
fpBody.rotation.order = "YXZ";
const fpUpper = new THREE.Group();
const fpTorso = new THREE.Group();
fpTorso.position.y = 0.95;
fpUpper.add(fpTorso);
fpBody.add(fpUpper);
scene.add(fpBody);

const HIP_Y = 0.95;
const bodyBox = (w, h, d, m, x, y, z) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y - HIP_Y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  fpTorso.add(mesh);
  return mesh;
};

bodyBox(0.5, 0.44, 0.3, sleeve, 0, 1.22, 0);
bodyBox(0.44, 0.09, 0.31, bodyDark, 0, 1.05, 0);
bodyBox(0.42, 0.24, 0.26, bodyCloth2, 0, 0.95, 0);

const fpLegs = [];
for (const sx of [-0.12, 0.12]) {
  const pivot = new THREE.Group();
  pivot.position.set(sx, 0.85, 0);
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.55, 0.22), bodyCloth2);
  thigh.position.y = -0.275;
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.19), bodyDark);
  shin.position.y = -0.65;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.34), bodyDark);
  foot.position.set(0, -0.79, -0.05);
  const toe = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.1), bodyDark);
  toe.position.set(0, -0.81, -0.24);
  for (const m of [thigh, shin, foot, toe]) {
    m.castShadow = true;
    m.receiveShadow = true;
    pivot.add(m);
  }
  fpUpper.add(pivot);
  fpLegs.push(pivot);
}

const lantern = new THREE.Group();
const lanternBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.17, 0.14), metal);
const lanternGlass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.1), glass);
const lanternTop = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.09, 4), metal);
lanternTop.position.y = 0.13;
const lanternLight = new THREE.PointLight(0xffc46a, 0, 26, 1.8);
lantern.add(lanternBody, lanternGlass, lanternTop, lanternLight);
lantern.position.set(0.03, -0.1, -0.06);
armR.add(lantern);
view.position.set(0, 0, 0);

const keys = Object.create(null);
let locked = false;
let uiState = "menu";
let fly = false;
let attackCd = 0;
let swing = 0;
let hitStop = 0;

const ATK = {
  fist: { dur: 0.3, w: 0.12 },
  knife: { dur: 0.28, w: 0.15 },
  sword: { dur: 0.4, w: 0.35 },
  spear: { dur: 0.46, w: 0.4 },
  club: { dur: 0.5, w: 0.6 },
  mace: { dur: 0.56, w: 0.72 },
  axe: { dur: 0.55, w: 0.7 },
  pick: { dur: 0.55, w: 0.65 },
  shield: { dur: 0.36, w: 0.45 },
  shovel: { dur: 0.5, w: 0.5 },
};
const ATK_DEFAULT = { dur: 0.4, w: 0.35 };
let atkSpec = ATK_DEFAULT;
let atkKind = "fist";
let atkHeavy = false;
let atkPower = 0;
let atkDur = 0.4;

const CHARGE_MIN = 0.35;
let mouseL = false;
let chargeT = 0;
let chargeArmed = false;
let charging = false;

function jabCurve(p) {
  if (p < 0.32) {
    const q = p / 0.32;
    return q * q * (2 - q);
  }
  if (p < 0.48) return 1;
  const q = (p - 0.48) / 0.52;
  return 1 - q * q * (3 - 2 * q);
}

function elbowCurve(p) {
  if (p < 0.14) {
    const q = p / 0.14;
    return 0.55 * q * q;
  }
  if (p < 0.36) {
    const q = (p - 0.14) / 0.22;
    return 0.55 * (1 - q * q * (2 - q));
  }
  if (p < 0.52) return 0;
  if (p < 0.78) {
    const q = (p - 0.52) / 0.26;
    return 0.5 * q * q;
  }
  const q = (p - 0.78) / 0.22;
  return 0.5 * (1 - q * q * (3 - 2 * q));
}

function atkPhase(p, up, down) {
  if (p < 0.3) {
    const q = p / 0.3;
    return up * q * q;
  }
  if (p < 0.5) {
    const q = (p - 0.3) / 0.2;
    return up + (down - up) * (q * q * (2 - q));
  }
  const q = (p - 0.5) / 0.5;
  return down * (1 - q * q * (3 - 2 * q));
}

function atkEnv(p) {
  if (p < 0.28 || p > 0.88) return 0;
  if (p < 0.5) {
    const q = (p - 0.28) / 0.22;
    return q * q;
  }
  const q = (p - 0.5) / 0.38;
  return 1 - q * q * (3 - 2 * q);
}

function attackLunge(power) {
  if (!player.onGround || player.swimming) return;
  if (loadout.mode === "creative" && fly) return;
  const s = Math.sin(player.yaw);
  const c = Math.cos(player.yaw);
  player.vel.x += -s * power;
  player.vel.z += -c * power;
}
let shadowsApplied = settings.shadows;
let minimapApplied = settings.minimap;

const menu = document.getElementById("menu");
const playBtn = document.getElementById("play");

function lockPointer() {
  uiState = "playing";
  let p;
  try {
    p = renderer.domElement.requestPointerLock();
  } catch (err) {
    uiState = "pause";
    showPause();
    return;
  }
  if (p && p.catch) {
    p.catch(() => {
      uiState = "pause";
      showPause();
    });
  }
}

document.addEventListener("pointerlockerror", () => {
  if (uiState === "playing") {
    uiState = "pause";
    showPause();
  }
});

function startGame() {
  initAudio();
  resumeAudio();
  playClick();
  menu.style.display = "none";
  hidePause();
  lockPointer();
}
playBtn.addEventListener("click", startGame);
menu.addEventListener("click", (e) => {
  if (e.target === menu) startGame();
});

function backToMenu() {
  hidePause();
  hideDeath();
  if (backpackOpen()) toggleBackpack(false);
  uiState = "menu";
  fly = false;
  menu.style.display = "flex";
}

function respawn() {
  loadout.health = 100;
  loadout.hunger = 100;
  loadout.breath = 100;
  fly = false;
  player.pos.set(spawn.x, Math.max(heightAt(spawn.x, spawn.z), WATER_LEVEL + 0.2), spawn.z);
  player.vel.set(0, 0, 0);
  hideDeath();
  hidePause();
  if (backpackOpen()) toggleBackpack(false);
  lockPointer();
}

function die(reason) {
  if (uiState === "death") return;
  uiState = "death";
  fly = false;
  if (document.pointerLockElement) document.exitPointerLock();
  showDeath(reason);
}

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (locked) {
    uiState = "playing";
    menu.style.display = "none";
    hidePause();
    resumeAudio();
  } else if (uiState === "playing") {
    uiState = "pause";
    showPause();
  }
});

function toggleBackpackKey() {
  if (uiState === "playing" || uiState === "backpack") toggleBackpack();
}

document.addEventListener("mousemove", (e) => {
  if (!locked) return;
  const s = 0.0022 * (settings.sens / 100);
  player.yaw -= e.movementX * s;
  player.pitch -= e.movementY * s;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch));
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

document.addEventListener("mousedown", (e) => {
  if (!locked || uiState !== "playing") return;
  if (e.button === 0) {
    mouseL = true;
    tryAttack();
  } else if (e.button === 2) useHotbarItem();
});

document.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  if (mouseL && locked && uiState === "playing" && chargeT >= CHARGE_MIN) {
    doAttack(true, Math.min(1, (chargeT - CHARGE_MIN) / 0.55));
  }
  mouseL = false;
  chargeT = 0;
  chargeArmed = false;
});

document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "KeyT") dayTime = (dayTime + 0.06) % 1;
  if (e.code === "KeyM") toggleMute();
  if (e.code === "Space") e.preventDefault();
  if (e.code === "Tab" || e.code === "KeyB") {
    e.preventDefault();
    if (!e.repeat) toggleBackpackKey();
  }
  if (e.code === "KeyF" && loadout.mode === "creative" && !e.repeat) {
    fly = !fly;
    player.vel.y = 0;
    toast(fly ? "Flying — Space up, Ctrl down" : "Landing", "good");
  }
  if (/^Digit[1-6]$/.test(e.code) && !e.repeat) {
    loadout.hotbar = +e.code.slice(5) - 1;
    playClick();
    document.querySelectorAll(".hot-slot").forEach((el, i) => el.classList.toggle("active", i === loadout.hotbar));
  }
});
document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const hud = {
  pos: document.getElementById("pos"),
  alt: document.getElementById("alt"),
  clock: document.getElementById("clock"),
  fps: document.getElementById("fps"),
  stamina: document.getElementById("stamina"),
  staminaWrap: document.getElementById("staminaWrap"),
  health: document.getElementById("health"),
  hunger: document.getElementById("hunger"),
  breath: document.getElementById("breath"),
  breathWrap: document.getElementById("breathWrap"),
  modeTag: document.getElementById("modeTag"),
  depth: document.getElementById("depth"),
  waterfx: document.getElementById("waterfx"),
  minimap: document.getElementById("minimap"),
};

const MINI = 256;
const miniBase = document.createElement("canvas");
miniBase.width = miniBase.height = MINI;
{
  const ctx = miniBase.getContext("2d");
  const img = ctx.createImageData(MINI, MINI);
  for (let j = 0; j < MINI; j++) {
    for (let i = 0; i < MINI; i++) {
      const x = (i / (MINI - 1)) * 2 * MAP_HALF - MAP_HALF;
      const z = (j / (MINI - 1)) * 2 * MAP_HALF - MAP_HALF;
      const h = heightAt(x, z);
      const col = h < WATER_LEVEL ? new THREE.Color(0x1d4f7c) : terrainColor(h, 0, x, z);
      const o = (j * MINI + i) * 4;
      img.data[o] = col.r * 255;
      img.data[o + 1] = col.g * 255;
      img.data[o + 2] = col.b * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawMinimap() {
  const ctx = hud.minimap.getContext("2d");
  const S = hud.minimap.width;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(miniBase, 0, 0, S, S);
  const px = ((player.pos.x + MAP_HALF) / (MAP_HALF * 2)) * S;
  const pz = ((player.pos.z + MAP_HALF) / (MAP_HALF * 2)) * S;
  ctx.fillStyle = "#9fe870";
  ctx.strokeStyle = "#0b1a06";
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-player.yaw);
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

let dayTime = 0.16;
const skyDay = new THREE.Color(0x8ec5ee);
const skyNight = new THREE.Color(0x070c1a);
const skyDusk = new THREE.Color(0xe88a4e);
const skyNow = new THREE.Color();
const sunDir = new THREE.Vector3();

function updateSky() {
  const a = dayTime * Math.PI * 2;
  const elev = Math.sin(a);
  sunDir.set(Math.cos(a), Math.sin(a), 0.35).normalize();
  const dayF = smoothstep(-0.1, 0.3, elev);
  const duskF = Math.max(0, 1 - Math.abs(elev) / 0.35) * (elev > -0.35 ? 1 : 0);

  skyNow.copy(skyNight).lerp(skyDay, dayF);
  skyNow.lerp(skyDusk, duskF * 0.55);
  scene.background = skyNow;
  scene.fog.color.copy(skyNow);
  scene.fog.near = 40 + dayF * 40;
  scene.fog.far = 380 + dayF * 620;

  sun.position.copy(player.pos).addScaledVector(sunDir, 260);
  sun.target.position.copy(player.pos);
  sun.intensity = 2.6 * dayF;
  sun.color.setHSL(0.11, 0.75 - dayF * 0.45, 0.55 + dayF * 0.35);

  moon.position.copy(player.pos).addScaledVector(sunDir, -260);
  moon.target.position.copy(player.pos);
  moon.intensity = 0.32 * (1 - dayF);

  hemi.intensity = 0.16 + 0.55 * dayF;
  hemi.color.setHex(dayF > 0.4 ? 0xcfe4ff : 0x4a5f8a);

  sunDisc.position.copy(camera.position).addScaledVector(sunDir, 1600);
  moonDisc.position.copy(camera.position).addScaledVector(sunDir, -1600);
  sunDisc.visible = elev > -0.15;
  moonDisc.visible = elev < 0.25;

  lanternLight.intensity = 0.6 + (1 - dayF) * 5.5;
  glass.emissiveIntensity = 1.2 + (1 - dayF) * 3;

  const hh = (dayTime * 24 + 6) % 24;
  const h = Math.floor(hh);
  const m = Math.floor((hh - h) * 60);
  hud.clock.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return dayF;
}

function collideObstacles() {
  const p = player.pos;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (o.dead) continue;
    const dx = p.x - o.x;
    const dz = p.z - o.z;
    const rr = o.r + player.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      p.x = o.x + (dx / d) * rr;
      p.z = o.z + (dz / d) * rr;
    }
  }
}

function updatePlayer(dt) {
  if (mouseL && uiState === "playing") {
    chargeT = Math.min(1, chargeT + dt);
    if (!chargeArmed && chargeT >= CHARGE_MIN) {
      chargeArmed = true;
      playChargeReady();
    }
  } else {
    mouseL = false;
    chargeT = 0;
    chargeArmed = false;
  }
  charging = mouseL && chargeT > 0.05;
  player.crouch = !!keys.ControlLeft || !!keys.ControlRight;
  const fx = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const sx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const flying = loadout.mode === "creative" && fly;

  const ground = heightAt(player.pos.x, player.pos.z);
  const eye = player.crouch ? 1.05 : 1.68;
  const wasSwimming = player.swimming;
  player.swimming = !flying && ground < WATER_LEVEL - 1.2 && player.pos.y < WATER_LEVEL + 0.4;
  if (player.swimming !== wasSwimming) playSplash(player.swimming ? 1 : 0.6);

  const moving = fx !== 0 || sx !== 0;
  const wantSprint =
    (keys.ShiftLeft || keys.ShiftRight) && moving && !player.crouch && player.stamina > 1 && !player.swimming;
  const speed =
    (flying
      ? wantSprint
        ? 26
        : 15
      : player.swimming
        ? 4.2
        : player.crouch
          ? 2.8
          : wantSprint
            ? 10.6
            : 6) * (charging ? 0.65 : 1);

  if (wantSprint) player.stamina = Math.max(0, player.stamina - 24 * dt);
  else player.stamina = Math.min(100, player.stamina + (moving ? 9 : 18) * dt);
  player.sprinting = wantSprint;

  const survival = loadout.mode === "survival";
  if (survival && player.stamina <= 0 && !player.exhausted) {
    player.exhausted = true;
    playBreath(true);
  } else if (player.stamina > 25) {
    player.exhausted = false;
  }

  player.breathTimer -= dt;
  if (survival && player.stamina < 35 && player.breathTimer <= 0) {
    const critical = player.stamina < 15;
    player.breathTimer = critical ? 0.75 : 1.2;
    playBreath(critical);
  }

  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  let wx = 0;
  let wz = 0;
  if (moving) {
    const len = Math.hypot(fx, sx);
    const f = fx / len;
    const s = sx / len;
    wx = (-sin * f + cos * s) * speed;
    wz = (-cos * f - sin * s) * speed;
  }

  const accel = flying || player.onGround || player.swimming ? 14 : 3;
  const t = 1 - Math.exp(-accel * dt);
  player.vel.x += (wx - player.vel.x) * t;
  player.vel.z += (wz - player.vel.z) * t;

  if (flying) {
    const up = keys.Space ? 1 : 0;
    const down = player.crouch ? 1 : 0;
    player.vel.y += ((up - down) * 26 - player.vel.y * 6) * dt;
  } else if (player.swimming) {
    player.vel.y += (keys.Space ? 6 : -1.6 - player.vel.y * 2) * dt * 4;
    player.vel.y = Math.max(-3, Math.min(3.4, player.vel.y));
    if (player.pos.y < ground) player.pos.y = ground;
  } else {
    player.vel.y -= 25 * dt;
    if (player.onGround && keys.Space) {
      player.vel.y = 8.6;
      player.onGround = false;
      player.landDip = -0.09;
      playJump();
    }
  }

  player.pos.addScaledVector(player.vel, dt);

  const g = heightAt(player.pos.x, player.pos.z);
  const wasAir = !player.onGround;
  if (player.pos.y <= g) {
    player.pos.y = g;
    if (wasAir) {
      const impact = Math.max(0, -player.vel.y);
      if (impact > 3) playLand(Math.min(1, impact / 16));
      if (impact > 14 && loadout.mode === "survival" && !flying) {
        damagePlayer((impact - 14) * 2.8, "Fatal fall");
      }
      player.lastStep = Math.floor(player.bobPhase / Math.PI);
    }
    if (wasAir && player.vel.y < -9) player.landDip = Math.max(-0.22, player.vel.y * 0.012);
    player.vel.y = Math.max(0, player.vel.y);
    player.onGround = true;
  } else {
    player.onGround = false;
  }

  player.pos.x = Math.max(-WALK_LIMIT, Math.min(WALK_LIMIT, player.pos.x));
  player.pos.z = Math.max(-WALK_LIMIT, Math.min(WALK_LIMIT, player.pos.z));
  collideObstacles();

  const horiz = Math.hypot(player.vel.x, player.vel.z);
  const runF = Math.min(1, horiz / 10.6);
  if (player.onGround && horiz > 0.6) {
    const prevPhase = player.bobPhase;
    player.bobPhase += dt * (2.6 + horiz * 0.62);
    player.bobAmp = Math.min(1, player.bobAmp + dt * 5);
    const stepIdx = Math.floor(player.bobPhase / Math.PI);
    if (player.lastStep === null) player.lastStep = stepIdx;
    else if (stepIdx !== Math.floor(prevPhase / Math.PI)) {
      player.lastStep = stepIdx;
      if (!player.swimming && horiz > 1.2) playStep(surfaceAt(player.pos.x, player.pos.z));
    }
  } else {
    player.bobAmp = Math.max(0, player.bobAmp - dt * 5);
  }
  player.landDip += (0 - player.landDip) * Math.min(1, dt * 8);

  const bobY = Math.sin(player.bobPhase * 2) * (0.05 + runF * 0.035) * player.bobAmp;
  const bobX = Math.cos(player.bobPhase) * (0.045 + runF * 0.03) * player.bobAmp;
  eyeRig.position.set(player.pos.x + bobX * 0.4, player.pos.y + eye + bobY + player.landDip, player.pos.z);
  eyeRig.rotation.set(
    player.pitch,
    player.yaw,
    Math.sin(player.bobPhase) * (0.012 + runF * 0.014) * player.bobAmp - sx * 0.022,
    "YXZ"
  );

  const atkP = swing > 0 ? 1 - swing : 0;
  const atkW = atkSpec.w;
  const amp = atkHeavy ? 1.4 + atkPower * 0.5 : 1;
  const env = swing > 0 ? atkEnv(atkP) : 0;
  const pitch = swing > 0 ? atkPhase(atkP, (0.13 + 0.07 * atkW) * amp, -(0.42 + 0.28 * atkW) * amp) : 0;

  const sway = new THREE.Vector3(-sx * 0.045, -bobY * 1.6 + player.landDip * 0.6, 0);
  view.position.lerp(sway, 1 - Math.exp(-8 * dt));
  view.rotation.z += ((sx * 0.05 + env * 0.1 * atkW * amp) - view.rotation.z) * (1 - Math.exp(-8 * dt));
  view.position.y -= env * 0.05 * amp;
  view.position.z = (keys.ShiftLeft ? 0.06 : 0) + (player.crouch ? 0.08 : 0) - env * 0.13 * amp;

  view.rotation.x = pitch;
  view.rotation.y = -env * 0.14 * atkW * amp;
  if (env > 0.01) {
    const s = env * (0.02 + atkW * 0.05) * amp;
    view.rotation.x += (Math.random() - 0.5) * s;
    view.rotation.y += (Math.random() - 0.5) * s;
    view.rotation.z += (Math.random() - 0.5) * s * 1.5;
  }
  if (charging && swing <= 0) {
    const cl = Math.min(1, chargeT / 0.5);
    view.rotation.x += (Math.random() - 0.5) * 0.014 * cl;
    view.rotation.y += (Math.random() - 0.5) * 0.014 * cl;
  }
  camera.fov +=
    (settings.fov + (wantSprint ? 10 : 0) - env * 6 * atkW * amp - (charging ? 2.5 : 0) - camera.fov) *
    Math.min(1, dt * 6);
  camera.updateProjectionMatrix();

  const camUnder = eyeRig.position.y < WATER_LEVEL;
  hud.waterfx.style.opacity = camUnder ? "0.85" : "0";
  hud.depth.style.opacity = camUnder ? "1" : "0";
  hud.depth.textContent = camUnder ? `DEPTH ${Math.max(0, WATER_LEVEL - player.pos.y + 1.4).toFixed(1)} m` : "";
}

function updateCreatures(dt, t, dayF) {
  const survival = loadout.mode === "survival";
  for (const c of creatures) {
    const toX = player.pos.x - c.g.position.x;
    const toZ = player.pos.z - c.g.position.z;
    const dist = Math.hypot(toX, toZ);
    c.timer -= dt;
    c.atkCd -= dt;
    c.growlCd -= dt;

    let hunting = false;
    if (c.hostile && survival) {
      hunting = (c.aggro || dayF < 0.38) && dist < 60;
      if (hunting) {
        c.angle = Math.atan2(toX, toZ);
        c.speed = dist > 2.3 ? 5.4 : 0;
        if (c.growlCd <= 0 && dist < 34) {
          c.growlCd = 5 + Math.random() * 5;
          playGrowl(dist);
        }
        if (dist < 2.4 && c.atkCd <= 0) {
          c.atkCd = 1.5;
          playWolfAttack();
          damagePlayer(12, "Mauled by a wolf");
        }
      }
    }

    if (!hunting) {
      if (!c.hostile && dist < 22 && c.panic <= 0) playDeerCall(dist);
      if (dist < (c.hostile ? 14 : 22)) {
        c.panic = 1.6;
        c.angle = Math.atan2(-toX, -toZ);
      }
      if (c.panic > 0) {
        c.panic -= dt;
        c.speed = 7;
      } else if (c.timer <= 0) {
        c.timer = 2 + Math.random() * 4;
        c.angle += (Math.random() - 0.5) * 3;
        c.speed = Math.random() < 0.35 ? 0 : 1.6 + Math.random() * 2;
      }
    }

    if (c.speed > 0) {
      const nx = c.g.position.x + Math.sin(c.angle) * c.speed * dt;
      const nz = c.g.position.z + Math.cos(c.angle) * c.speed * dt;
      const nh = heightAt(nx, nz);
      if (nh > WATER_LEVEL + 0.4 && Math.abs(nx) < WALK_LIMIT && Math.abs(nz) < WALK_LIMIT) {
        c.g.position.x = nx;
        c.g.position.z = nz;
        c.baseY = nh;
      } else {
        c.angle += Math.PI * (0.5 + Math.random() * 0.5);
        c.speed = 0;
      }
    }
    c.g.rotation.y = -c.angle + Math.PI / 2;
    c.phase += dt * c.speed * 3.2;
    const legSwing = Math.sin(c.phase) * Math.min(0.7, c.speed * 0.22);
    c.legs[0].rotation.z = legSwing;
    c.legs[3].rotation.z = legSwing;
    c.legs[1].rotation.z = -legSwing;
    c.legs[2].rotation.z = -legSwing;
    c.g.position.y = c.baseY + Math.abs(Math.sin(c.phase)) * 0.03 * Math.min(1, c.speed);
    c.head.rotation.z = Math.sin(t * 1.7 + c.phase) * 0.08;
  }
}

function damagePlayer(amount, cause, ignoreArmor = false) {
  if (loadout.mode !== "survival" || amount <= 0) return;
  let dmg = amount;
  if (!ignoreArmor) {
    const armor = getStats().armor;
    dmg = amount * (1 - armor / (armor + 50));
  }
  loadout.health -= dmg;
  if (dmg >= 1.5) playHurt();
  if (loadout.health <= 0) {
    loadout.health = 0;
    die(cause);
  }
}

function hitCreature(c, dmg, kind = "fist") {
  c.hp -= dmg;
  c.aggro = true;
  if (!c.hostile) c.panic = 2.4;
  playHit(kind);
  if (c.hp <= 0) {
    scene.remove(c.g);
    const i = creatures.indexOf(c);
    if (i >= 0) creatures.splice(i, 1);
    const loot = c.hostile ? 1 : 2;
    addItem("meat_raw", loot);
    toast(`Killed ${c.name} → Raw Meat ×${loot}`, "good");
  } else {
    toast(`${c.name} hit — ${Math.ceil(c.hp)} hp left`);
  }
}

const _hvCam = new THREE.Vector3();
const _hvDir = new THREE.Vector3();
const _hvTo = new THREE.Vector3();
const _qTip = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const _qTilt = new THREE.Quaternion();
const _eYaw = new THREE.Euler();
const _tiltAxis = new THREE.Vector3(1, 0, 0);
let lastToolHint = 0;

function findHarvestTarget() {
  camera.getWorldPosition(_hvCam);
  camera.getWorldDirection(_hvDir);
  let best = null;
  let bestScore = 0;
  const consider = (kind, ref, cx, cy, cz, reach) => {
    if (ref.state !== "alive") return;
    _hvTo.set(cx - _hvCam.x, cy - _hvCam.y, cz - _hvCam.z);
    const d = _hvTo.length();
    if (d > reach) return;
    _hvTo.divideScalar(d);
    const dot = _hvTo.dot(_hvDir);
    if (dot < 0.55) return;
    const score = dot * 2 - d * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = { kind, ref };
    }
  };
  for (const tr of trees) consider("tree", tr, tr.x, tr.h + 3.5 * tr.sc, tr.z, 5.5);
  for (const rk of rocks) consider("rock", rk, rk.x, rk.y, rk.z, 5);
  return best;
}

function hintTool(msg) {
  const now = performance.now();
  if (now - lastToolHint > 5000) {
    lastToolHint = now;
    toast(msg);
  }
}

function startTreeFall(tr) {
  tr.hp = 0;
  tr.state = "falling";
  tr.t = 0;
  const dx = tr.x - player.pos.x;
  const dz = tr.z - player.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  tr.tipAxis = new THREE.Vector3(dz / len, 0, -dx / len);
  playTreeFall();
  harvestFx.add(tr);
}

function startRockBreak(rk) {
  rk.hp = 0;
  rk.state = "crumble";
  rk.t = 0;
  rk.obstacle.dead = true;
  playRockBreak();
  harvestFx.add(rk);
}

function giveTreeLoot(tr) {
  if (tr.loot) return;
  tr.loot = true;
  const ok = addItem("wood", 3);
  if (ok) toast("Tree felled → Wood ×3", "good");
  else toast("Backpack full — wood lost", "bad");
}

function giveRockLoot(rk) {
  const stones = 2 + (Math.random() < 0.5 ? 1 : 0);
  let msg = `Rock broken → Stone ×${stones}`;
  const ok = addItem("stone", stones);
  if (Math.random() < 0.35 && addItem("flint", 1)) msg += ", Flint ×1";
  if (ok) toast(msg, "good");
  else toast("Backpack full — loot lost", "bad");
}

function harvestHit(mult = 1) {
  const target = findHarvestTarget();
  if (!target) return false;
  const held = loadout.equip.mainhand;
  const shape = held && ITEMS[held] ? ITEMS[held].shape : "fist";
  const ref = target.ref;
  if (target.kind === "tree") {
    const right = shape === "axe";
    ref.hp -= (right ? 26 : 7) * mult;
    ref.shake = 1;
    harvestFx.add(ref);
    playChop(right);
    if (!right) hintTool("An axe chops trees much faster");
    if (ref.hp <= 0) startTreeFall(ref);
  } else {
    const right = shape === "pick";
    ref.hp -= (right ? 22 : 5) * mult;
    ref.shake = 1;
    harvestFx.add(ref);
    playMine(right);
    if (!right) hintTool("A pickaxe mines rock much faster");
    if (ref.hp <= 0) startRockBreak(ref);
  }
  return true;
}

function setTreeMatrix(tr, q) {
  tmpM.compose(tmpV.set(tr.x, tr.h, tr.z), q, tmpS.set(tr.sc, tr.sc, tr.sc));
  treeMeshes.trunks.setMatrixAt(tr.idx, tmpM);
  treeMeshes.lows.setMatrixAt(tr.idx, tmpM);
  treeMeshes.tops.setMatrixAt(tr.idx, tmpM);
}

function updateHarvestFx(dt, t) {
  if (!harvestFx.size) return;
  let treesDirty = false;
  let rocksDirty = false;
  const done = [];
  for (const it of harvestFx) {
    if (it.kind === "tree") {
      if (it.state === "falling") {
        it.t += dt;
        const p = Math.min(1, it.t / 1.5);
        _qYaw.setFromEuler(_eYaw.set(0, it.rotY, 0));
        _qTip.setFromAxisAngle(it.tipAxis, (Math.PI / 2) * p * p);
        setTreeMatrix(it, _qTip.multiply(_qYaw));
        treesDirty = true;
        if (p >= 1) {
          it.state = "fallen";
          giveTreeLoot(it);
          done.push(it);
        }
      } else if (it.shake > 0) {
        it.shake = Math.max(0, it.shake - dt * 3.5);
        _qYaw.setFromEuler(_eYaw.set(0, it.rotY, 0));
        _qTilt.setFromAxisAngle(_tiltAxis, Math.sin(t * 34) * 0.04 * it.shake);
        setTreeMatrix(it, _qTilt.multiply(_qYaw));
        treesDirty = true;
        if (it.shake === 0) {
          setTreeMatrix(it, _qYaw.setFromEuler(_eYaw.set(0, it.rotY, 0)));
          done.push(it);
        }
      } else done.push(it);
    } else {
      if (it.state === "crumble") {
        it.t += dt;
        const p = Math.min(1, it.t / 0.45);
        const s = 1 - p;
        _qYaw.setFromEuler(_eYaw.set(it.rx + p * 1.5, it.ry + p * 2, it.rz + p));
        tmpM.compose(tmpV.set(it.x, it.y - p * 0.35, it.z), _qYaw, tmpS.set(it.sc.x * s, it.sc.y * s, it.sc.z * s));
        rockMesh.setMatrixAt(it.idx, tmpM);
        rocksDirty = true;
        if (p >= 1) {
          rockMesh.setMatrixAt(it.idx, tmpM.makeScale(0, 0, 0));
          it.state = "gone";
          giveRockLoot(it);
          done.push(it);
        }
      } else if (it.shake > 0) {
        it.shake = Math.max(0, it.shake - dt * 4);
        _qYaw.setFromEuler(_eYaw.set(it.rx, it.ry, it.rz));
        tmpM.compose(
          tmpV.set(
            it.x + Math.sin(t * 40) * 0.015 * it.shake,
            it.y,
            it.z + Math.cos(t * 37) * 0.015 * it.shake
          ),
          _qYaw,
          tmpS.set(it.sc.x, it.sc.y, it.sc.z)
        );
        rockMesh.setMatrixAt(it.idx, tmpM);
        rocksDirty = true;
        if (it.shake === 0) {
          tmpM.compose(tmpV.set(it.x, it.y, it.z), _qYaw, tmpS.set(it.sc.x, it.sc.y, it.sc.z));
          rockMesh.setMatrixAt(it.idx, tmpM);
          done.push(it);
        }
      } else done.push(it);
    }
  }
  for (const it of done) harvestFx.delete(it);
  if (treesDirty && treeMeshes) {
    treeMeshes.trunks.instanceMatrix.needsUpdate = true;
    treeMeshes.lows.instanceMatrix.needsUpdate = true;
    treeMeshes.tops.instanceMatrix.needsUpdate = true;
  }
  if (rocksDirty && rockMesh) rockMesh.instanceMatrix.needsUpdate = true;
}

const WIND_X = 0.8;
const WIND_Z = 0.6;
const WIND_RADIUS = 175;
const _windAxis = new THREE.Vector3(WIND_Z, 0, -WIND_X);
const _qWTrunk = new THREE.Quaternion();
const _qWLow = new THREE.Quaternion();
const _qWTop = new THREE.Quaternion();

function updateTreeWind(t) {
  if (!treeMeshes) return;
  const px = player.pos.x;
  const pz = player.pos.z;
  const R2 = WIND_RADIUS * WIND_RADIUS;
  const near = WIND_RADIUS * 0.72;
  const gust = 0.62 + 0.26 * Math.sin(t * 0.31) + 0.18 * Math.sin(t * 0.117 + 2.1);
  let dirty = false;
  for (const tr of trees) {
    if (tr.state !== "alive" || harvestFx.has(tr)) continue;
    const dx = tr.x - px;
    const dz = tr.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 > R2) continue;
    let fade = 1;
    if (d2 > near * near) {
      const dist = Math.sqrt(d2);
      fade = Math.max(0, 1 - (dist - near) / (WIND_RADIUS - near));
    }
    const w =
      Math.sin(t * 1.25 + tr.wp) * 0.6 +
      Math.sin(t * 2.15 + tr.wp * 1.7) * 0.25 +
      Math.sin(t * 0.62 - (tr.x + tr.z) * 0.04) * 0.15;
    const sway = 0.06 * tr.wv * gust * w * fade;
    const i = tr.idx;
    const sx = tr.x;
    const sy = tr.h;
    const sz = tr.z;
    const sc = tr.sc;
    _qYaw.setFromEuler(_eYaw.set(0, tr.rotY, 0));
    tmpM.compose(tmpV.set(sx, sy, sz), _qWTrunk.setFromAxisAngle(_windAxis, sway * 0.4).multiply(_qYaw), tmpS.set(sc, sc, sc));
    treeMeshes.trunks.setMatrixAt(i, tmpM);
    tmpM.compose(tmpV.set(sx, sy, sz), _qWLow.setFromAxisAngle(_windAxis, sway).multiply(_qYaw), tmpS.set(sc, sc, sc));
    treeMeshes.lows.setMatrixAt(i, tmpM);
    tmpM.compose(tmpV.set(sx, sy, sz), _qWTop.setFromAxisAngle(_windAxis, sway * 1.3).multiply(_qYaw), tmpS.set(sc, sc, sc));
    treeMeshes.tops.setMatrixAt(i, tmpM);
    dirty = true;
  }
  if (dirty) {
    treeMeshes.trunks.instanceMatrix.needsUpdate = true;
    treeMeshes.lows.instanceMatrix.needsUpdate = true;
    treeMeshes.tops.instanceMatrix.needsUpdate = true;
  }
}

const harvestWrap = document.getElementById("harvest");
const harvestLabel = document.getElementById("harvestLabel");
const harvestFill = document.getElementById("harvestFill");
let harvestHudT = 0;

function updateHarvestHud(dt) {
  harvestHudT -= dt;
  if (harvestHudT > 0) return;
  harvestHudT = 0.1;
  if (uiState !== "playing") {
    harvestWrap.classList.add("hidden");
    return;
  }
  const tgt = findHarvestTarget();
  if (!tgt) {
    harvestWrap.classList.add("hidden");
    return;
  }
  harvestWrap.classList.remove("hidden");
  const ref = tgt.ref;
  const done = 1 - Math.max(0, ref.hp) / ref.maxHp;
  const pct = Math.round(done * 100);
  harvestFill.style.width = pct + "%";
  const held = loadout.equip.mainhand;
  const shape = held && ITEMS[held] ? ITEMS[held].shape : "fist";
  const right = tgt.kind === "tree" ? shape === "axe" : shape === "pick";
  const name = tgt.kind === "tree" ? "Tree" : "Rock";
  const hint = right ? "" : tgt.kind === "tree" ? " · equip an axe" : " · equip a pickaxe";
  harvestLabel.textContent = `${name} ${pct}%${hint}`;
}

function tryAttack() {
  doAttack(false);
}

function doAttack(heavy, power = 0) {
  if (attackCd > 0) return false;
  const held = loadout.equip.mainhand;
  const kind = held && ITEMS[held] ? ITEMS[held].shape : "fist";
  atkSpec = ATK[kind] || ATK_DEFAULT;
  atkKind = kind;
  atkHeavy = heavy;
  atkPower = power;
  atkDur = atkSpec.dur * (heavy ? 1.3 : 1);
  attackCd = atkDur * (heavy ? 1 : 0.9);
  swing = 1;
  playSwing(kind);
  if (heavy) playGrunt();
  else if (atkSpec.w >= 0.55 || Math.random() < 0.35) playGrunt();
  const mult = heavy ? 1.6 + power * 0.9 : 1;
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  const dir = camera.getWorldDirection(new THREE.Vector3());
  let best = null;
  let bestD = 4.2;
  for (const c of creatures) {
    const to = c.g.position.clone().sub(camPos);
    to.y += 1;
    const d = to.length();
    if (d > bestD) continue;
    to.normalize();
    if (to.dot(dir) < 0.5) continue;
    best = c;
    bestD = d;
  }
  if (best) {
    hitCreature(best, getStats().dmg * mult, kind);
    hitStop = (heavy ? 0.07 : 0.05) + atkSpec.w * 0.04;
    attackLunge((heavy ? 6 : 4) + atkSpec.w * (heavy ? 4 : 3));
    return true;
  }
  if (harvestHit(heavy ? 2 + power : 1)) {
    hitStop = heavy ? 0.06 : 0.04;
    attackLunge((heavy ? 3.5 : 1.8) + atkSpec.w * 2);
  } else {
    attackLunge((heavy ? 3 : 1.2) + atkSpec.w);
  }
  return true;
}

function updateSurvival(dt) {
  if (loadout.mode !== "survival") {
    loadout.health = 100;
    loadout.hunger = 100;
    loadout.breath = 100;
    return;
  }
  const fast = Math.hypot(player.vel.x, player.vel.z) > 6;
  loadout.hunger = Math.max(0, loadout.hunger - dt * (0.2 + (fast ? 0.32 : 0)));
  if (loadout.hunger <= 0) damagePlayer(dt * 2.5, "Starvation", true);
  else if (loadout.hunger > 55 && loadout.health < 100) {
    loadout.health = Math.min(100, loadout.health + dt * 0.9);
  }
  const under = eyeRig.position.y < WATER_LEVEL;
  if (under) {
    loadout.breath = Math.max(0, loadout.breath - dt * 9);
    if (loadout.breath <= 0) damagePlayer(dt * 9, "Drowning", true);
  } else {
    loadout.breath = Math.min(100, loadout.breath + dt * 40);
  }
}

let heldMesh = null;
let heldId = "__none__";
function updateHeld() {
  const id = loadout.equip.mainhand || "__none__";
  if (id === heldId) return;
  heldId = id;
  if (heldMesh) {
    handR.remove(heldMesh);
    heldMesh = null;
  }
  if (id !== "__none__") {
    heldMesh = buildItemMesh(id);
    heldMesh.scale.setScalar(0.7);
    heldMesh.position.set(0, -0.04, -0.29);
    heldMesh.rotation.set(-0.7, 0.1, 0.15);
    handR.add(heldMesh);
  }
}

function syncVideoSettings() {
  if (settings.shadows !== shadowsApplied) {
    shadowsApplied = settings.shadows;
    renderer.shadowMap.enabled = settings.shadows;
    sun.castShadow = settings.shadows;
    scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true));
    });
  }
  if (settings.minimap !== minimapApplied) {
    minimapApplied = settings.minimap;
    hud.minimap.style.display = settings.minimap ? "" : "none";
  }
}

function updateClouds(dt) {
  for (const c of clouds) {
    c.g.position.x += c.speed * dt;
    if (c.g.position.x > 1500) c.g.position.x = -1500;
  }
}

function updateBodyAnim(dt, t) {
  const horiz = Math.hypot(player.vel.x, player.vel.z);
  const speedF = Math.min(1, horiz / 10.6);
  const ground = player.onGround;
  const swimming = player.swimming;
  const flying = loadout.mode === "creative" && fly;
  const air = !ground && !swimming && !flying;
  const k = Math.min(1, dt * 11);

  fpBody.position.copy(player.pos);
  fpBody.rotation.y = player.yaw;
  fpBody.rotation.x += ((swimming ? -0.85 : 0) - fpBody.rotation.x) * k;

  const crouching = uiState === "playing" && player.crouch && !swimming && !flying;
  fpUpper.position.y += ((crouching ? -0.52 : 0) - fpUpper.position.y) * k;

  const sxk = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const aEnv = swing > 0 ? atkEnv(1 - swing) : 0;
  const chargeCl = charging && swing <= 0 ? Math.min(1, chargeT / 0.5) : 0;
  const leanTarget = swimming || flying ? 0 : ground && horiz > 7 ? -0.17 : crouching && horiz > 0.5 ? -0.09 : 0;
  fpTorso.rotation.x += (leanTarget - aEnv * 0.35 - chargeCl * 0.12 - fpTorso.rotation.x) * k;
  fpTorso.rotation.z += (-sxk * 0.06 - fpTorso.rotation.z) * k;
  const twistT =
    swing > 0
      ? atkPhase(1 - swing, -0.6, 0.85) * (0.7 + atkSpec.w * 0.6) * (atkHeavy ? 1.5 : 1)
      : -chargeCl * 0.45 * (0.7 + atkSpec.w * 0.4);
  fpTorso.rotation.y += (twistT - fpTorso.rotation.y) * k;
  fpTorso.position.y =
    HIP_Y +
    Math.sin(t * 1.7) * 0.008 +
    (horiz > 0.5 && ground ? Math.abs(Math.sin(player.bobPhase)) * 0.014 * player.bobAmp : 0);

  let lT, rT;
  if (swimming) {
    lT = Math.sin(t * 3.6) * 0.5;
    rT = -lT;
  } else if (flying) {
    lT = 0.1 + Math.sin(t * 1.3) * 0.07;
    rT = -0.1 - Math.sin(t * 1.3) * 0.07;
  } else if (air) {
    if (player.vel.y > 0.5) {
      lT = 0.75;
      rT = 0.5;
    } else if (player.vel.y < -0.5) {
      lT = -0.3;
      rT = 0.5;
    } else {
      lT = 0.25;
      rT = 0.2;
    }
  } else if (horiz > 0.5) {
    const amp = crouching ? 0.34 : 0.42 + speedF * 0.46;
    lT = Math.sin(player.bobPhase) * amp * player.bobAmp;
    rT = -lT;
  } else {
    lT = 0;
    rT = 0;
  }
  fpLegs[0].rotation.x += (lT - fpLegs[0].rotation.x) * k;
  fpLegs[1].rotation.x += (rT - fpLegs[1].rotation.x) * k;

  const base = -0.15;
  let aL, aR;
  if (swimming) {
    aL = -0.3 + Math.sin(t * 3.2) * 0.26;
    aR = -0.3 - Math.sin(t * 3.2) * 0.26;
  } else if (air) {
    aL = aR = -0.48;
  } else if (flying) {
    aL = base + Math.sin(t * 1.7) * 0.02;
    aR = base + Math.sin(t * 1.7 + 1.2) * 0.02;
  } else {
    const aAmp = horiz > 0.5 ? 0.16 + speedF * 0.26 : 0;
    const s = Math.sin(player.bobPhase) * aAmp * player.bobAmp;
    aL = base + s + Math.sin(t * 1.7) * 0.015;
    aR = base - s + Math.sin(t * 1.7 + 1.2) * 0.015;
  }
  const jabbing = swing > 0 && atkKind === "fist" && !atkHeavy;
  const jp = swing > 0 ? 1 - swing : 0;
  const ext = jabbing ? jabCurve(jp) : 0;
  if (swing > 0) {
    if (jabbing) {
      aR += ext * 0.2;
      aL += ext * 0.07;
    } else {
      const amp = atkHeavy ? 1.4 + atkPower * 0.5 : 1;
      const armA = atkPhase(
        jp,
        Math.min(1.75, (1.15 + 0.65 * atkSpec.w) * amp),
        Math.max(-1.35, -(1.5 + 0.85 * atkSpec.w) * amp)
      );
      aR += armA;
      aL += armA * 0.4;
    }
  } else if (charging) {
    const cl = Math.min(1, chargeT / 0.5);
    aR += 0.95 + 0.55 * cl + Math.sin(t * 34) * 0.035 * cl;
    aL += 0.5 + 0.25 * cl;
  }
  const kArm = swing > 0 || charging ? Math.min(1, dt * 22) : k;
  armL.rotation.x += (aL - armL.rotation.x) * kArm;
  armR.rotation.x += (aR - armR.rotation.x) * kArm;

  if (jabbing) {
    handR.rotation.x = elbowCurve(jp);
    handR.rotation.z = -ext * 0.6;
    armR.position.x = 0.26 - ext * 0.06;
    armR.position.z = -0.55 - ext * 0.22;
  } else if (charging) {
    const cl = Math.min(1, chargeT / 0.5);
    handR.rotation.x = 0.45 + 0.25 * cl;
    handR.rotation.z = 0;
    armR.position.x = 0.26;
    armR.position.z = -0.55;
  } else {
    handR.rotation.x = swing > 0 ? 0.4 * Math.min(1, aEnv * 1.6) : 0;
    handR.rotation.z = 0;
    armR.position.x = 0.26;
    armR.position.z = -0.55;
  }
  if (heldMesh) {
    const wrist = swing > 0 ? -atkPhase(jp, 0.5, -0.65) * (atkHeavy ? 1.4 : 1) : 0;
    heldMesh.rotation.x = -0.7 + wrist;
  }
}

let lastFpsTime = performance.now();
let fpsFrames = 0;
let hudTimer = 0;

function updateHud(dt) {
  fpsFrames++;
  hudTimer += dt;
  syncVideoSettings();
  if (hudTimer < 0.15) return;
  hudTimer = 0;
  const now = performance.now();
  const real = (now - lastFpsTime) / 1000;
  hud.fps.textContent = real > 0 ? Math.round(fpsFrames / real) : 0;
  lastFpsTime = now;
  fpsFrames = 0;
  hud.pos.textContent = `${player.pos.x.toFixed(0)}, ${player.pos.z.toFixed(0)}`;
  hud.alt.textContent = player.pos.y.toFixed(1);
  hud.stamina.style.width = `${player.stamina}%`;
  const lowStamina = player.stamina < 25;
  hud.stamina.classList.toggle("low", lowStamina);
  hud.staminaWrap.classList.toggle(
    "hidden",
    loadout.mode !== "survival" || (player.stamina >= 99.5 && !player.sprinting)
  );
  hud.health.style.width = `${loadout.health}%`;
  hud.hunger.style.width = `${loadout.hunger}%`;
  hud.breath.style.width = `${loadout.breath}%`;
  hud.modeTag.textContent = loadout.mode.toUpperCase();
  const underwater = eyeRig.position.y < WATER_LEVEL;
  hud.breathWrap.classList.toggle("hidden", loadout.mode !== "survival" || (!underwater && loadout.breath >= 100));
  drawMinimap();
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  const simulate = uiState === "playing" || uiState === "menu";
  if (simulate) dayTime = (dayTime + dt / DAY_LENGTH) % 1;

  if (uiState === "playing") {
    updatePlayer(dt);
    updateSurvival(dt);
  } else {
    mouseL = false;
    chargeT = 0;
    chargeArmed = false;
    charging = false;
    eyeRig.position.set(player.pos.x, player.pos.y + 1.68, player.pos.z);
    eyeRig.rotation.set(player.pitch, player.yaw, 0, "YXZ");
  }

  if (attackCd > 0) attackCd -= dt;
  if (hitStop > 0) hitStop -= dt;
  if (swing > 0) swing = Math.max(0, swing - (hitStop > 0 ? 0 : dt) / atkDur);
  updateHeld();
  updateBodyAnim(dt, t);

  const dayF = updateSky();
  if (simulate) {
    updateCreatures(dt, t, dayF);
    updateHarvestFx(dt, t);
    updateTreeWind(t);
    updateClouds(dt);
  }
  updateAmbience(dt, {
    dayF,
    underwater: eyeRig.position.y < WATER_LEVEL,
    moving: Math.hypot(player.vel.x, player.vel.z) > 1,
    altitude: player.pos.y,
    swimming: player.swimming,
  });
  updateMusic(dt, dayF);

  water.position.y = WATER_LEVEL + Math.sin(t * 0.6) * 0.08;
  water.material.color.setHSL(0.57, 0.55, 0.32 + Math.sin(dayTime * Math.PI * 2) * 0.04);

  updateHarvestHud(dt);
  updateHud(dt);
  renderer.render(scene, camera);
}

initInventory();
initMenus({
  onResume: () => {
    hidePause();
    lockPointer();
  },
  onQuit: backToMenu,
  onMode: (m) => {
    loadout.mode = m;
    fly = false;
    toast(`Game mode: ${m}`, "good");
  },
  onReset: () => {
    giveStartingKit();
    toast("New world started", "good");
    respawn();
  },
  onRespawn: respawn,
});
onBackpackToggle((o) => {
  if (o) {
    uiState = "backpack";
    if (document.pointerLockElement) document.exitPointerLock();
  } else if (uiState === "backpack") {
    lockPointer();
  }
});
giveStartingKit();

if (import.meta.env.DEV) {
  window.__wide = {
    damagePlayer,
    tryAttack,
    loadout,
    player,
    creatures,
    getStats,
    addItem,
    arm: () => {
      attackCd = 0;
    },
  };
}

updateSky();
drawMinimap();
animate();
