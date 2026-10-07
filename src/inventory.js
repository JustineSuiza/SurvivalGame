import * as THREE from "three";
import { ITEMS, SLOT_ORDER, SLOT_LABELS, iconSVG, slotAccepts } from "./items.js";
import { playClick, playEat, playEquip, playOpen, playPickup, playDrop } from "./audio.js";

export const loadout = {
  mode: "survival",
  inv: new Array(24).fill(null),
  equip: { head: null, chest: null, legs: null, feet: null, mainhand: null, offhand: null },
  hotbar: 0,
  health: 100,
  hunger: 100,
  breath: 100,
};

let open = false;
let selected = null;
let tab = "bag";
let onChange = () => {};
let onToggleCb = () => {};

export function onBackpackToggle(fn) {
  onToggleCb = fn;
}

export function onInventoryChange(fn) {
  onChange = fn;
}

export function isOpen() {
  return open;
}

export function toast(msg, kind = "") {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add("out"), 2100);
  setTimeout(() => el.remove(), 2600);
}

export function addItem(id, count = 1, quiet = false) {
  const it = ITEMS[id];
  if (!it) return false;
  const max = it.stack || 1;
  if (max > 1) {
    for (const s of loadout.inv) {
      if (s && s.id === id && s.count < max) {
        const take = Math.min(count, max - s.count);
        s.count += take;
        count -= take;
        if (count <= 0) {
          refresh();
          if (!quiet) playPickup();
          return true;
        }
      }
    }
  }
  while (count > 0) {
    const idx = loadout.inv.indexOf(null);
    if (idx === -1) {
      refresh();
      if (!quiet) playPickup();
      return false;
    }
    const take = Math.min(count, max);
    loadout.inv[idx] = { id, count: take };
    count -= take;
  }
  refresh();
  if (!quiet) playPickup();
  return true;
}

export function countItem(id) {
  return loadout.inv.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
}

export function removeItem(id, count = 1) {
  for (let i = 0; i < loadout.inv.length && count > 0; i++) {
    const s = loadout.inv[i];
    if (s && s.id === id) {
      const take = Math.min(count, s.count);
      s.count -= take;
      count -= take;
      if (s.count <= 0) loadout.inv[i] = null;
    }
  }
  refresh();
}

export function getStats() {
  let armor = 0;
  for (const slot of SLOT_ORDER) {
    const id = loadout.equip[slot];
    if (id && ITEMS[id].armor) armor += ITEMS[id].armor;
  }
  const hand = loadout.equip.mainhand;
  const dmg = hand ? ITEMS[hand].dmg || 5 : 5;
  return { armor: Math.min(80, armor), dmg };
}

function makeStack(id, count) {
  return { id, count };
}

function moveSlot(from, to) {
  const a = loadout.inv[from];
  const b = loadout.inv[to];
  if (!a) return;
  if (b && b.id === a.id && (ITEMS[a.id].stack || 1) > 1) {
    const max = ITEMS[a.id].stack;
    const take = Math.min(a.count, max - b.count);
    b.count += take;
    a.count -= take;
    if (a.count <= 0) loadout.inv[from] = null;
  } else {
    loadout.inv[to] = a;
    loadout.inv[from] = b;
  }
}

const METAL_COLORS = ["#dfe6ee", "#cfd6de", "#9aa0a6", "#7d838a", "#5d6167"];

export function equipKind(id) {
  const it = ITEMS[id];
  if (!it) return "";
  if (it.shape === "shield") return "wood";
  if (METAL_COLORS.includes(it.color)) return "metal";
  if (it.type === "armor") return "leather";
  if (it.type === "weapon" || it.type === "tool") return "wood";
  return "";
}

function equipFromInv(idx) {
  const s = loadout.inv[idx];
  if (!s) return;
  const it = ITEMS[s.id];
  if (!it.slot) {
    if (it.type === "food") eatFromInv(idx);
    else toast(`${it.name} cannot be equipped`);
    return;
  }
  const prev = loadout.equip[it.slot];
  loadout.equip[it.slot] = s.id;
  loadout.inv[idx] = prev ? makeStack(prev, 1) : null;
  playEquip(equipKind(s.id));
  toast(`Equipped ${it.name}`, "good");
  refresh();
}

function equipToSlot(idx, slot) {
  const s = loadout.inv[idx];
  if (!s) return;
  if (!slotAccepts(slot, s.id)) {
    toast(`${ITEMS[s.id].name} does not fit ${SLOT_LABELS[slot]}`);
    return;
  }
  const prev = loadout.equip[slot];
  loadout.equip[slot] = s.id;
  loadout.inv[idx] = prev ? makeStack(prev, 1) : null;
  playEquip(equipKind(s.id));
  toast(`Equipped ${ITEMS[s.id].name}`, "good");
  refresh();
}

function unequip(slot) {
  const id = loadout.equip[slot];
  if (!id) return;
  const idx = loadout.inv.indexOf(null);
  if (idx === -1) {
    toast("Backpack full");
    return;
  }
  loadout.inv[idx] = makeStack(id, 1);
  loadout.equip[slot] = null;
  playClick();
  refresh();
}

function eatFromInv(idx) {
  const s = loadout.inv[idx];
  if (!s || ITEMS[s.id].type !== "food") return;
  const it = ITEMS[s.id];
  loadout.hunger = Math.min(100, loadout.hunger + it.food);
  if (it.hp) loadout.health = Math.max(1, Math.min(100, loadout.health + it.hp));
  s.count -= 1;
  if (s.count <= 0) loadout.inv[idx] = null;
  playEat();
  toast(`Ate ${it.name} (+${it.food} hunger)`, "good");
  refresh();
}

export function useHotbarItem() {
  const s = loadout.inv[loadout.hotbar];
  if (!s) return false;
  const it = ITEMS[s.id];
  if (it.type === "food") {
    eatFromInv(loadout.hotbar);
    return true;
  }
  if (it.slot) {
    equipFromInv(loadout.hotbar);
    return true;
  }
  return false;
}

function dropSelected() {
  if (!selected) return;
  if (selected.area === "inv") {
    const s = loadout.inv[selected.idx];
    if (!s) return;
    toast(`Dropped ${ITEMS[s.id].name}`);
    loadout.inv[selected.idx] = null;
  } else if (selected.area === "equip") {
    unequip(selected.slot);
    return;
  } else return;
  playDrop();
  selected = null;
  refresh();
}

export function giveStartingKit() {
  loadout.inv.fill(null);
  loadout.equip = { head: null, chest: null, legs: null, feet: null, mainhand: null, offhand: null };
  loadout.health = 100;
  loadout.hunger = 100;
  loadout.breath = 100;
  if (loadout.mode === "survival") {
    loadout.inv[0] = makeStack("sword_wood", 1);
    loadout.inv[1] = makeStack("bread", 3);
    loadout.inv[2] = makeStack("apple", 3);
    loadout.inv[3] = makeStack("wood", 10);
    loadout.inv[4] = makeStack("stone", 8);
    loadout.inv[5] = makeStack("fiber", 6);
    loadout.inv[6] = makeStack("cap_leather", 1);
    loadout.equip.mainhand = "sword_wood";
    loadout.inv[0] = makeStack("axe_stone", 1);
  }
  selected = null;
  refresh();
}

const weaponColors = {};

export function buildItemMesh(id) {
  const it = ITEMS[id];
  if (!it) return new THREE.Group();
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.7, metalness: it.type === "weapon" && it.color.includes("df") ? 0.6 : 0.1 });
  const wood = new THREE.MeshStandardMaterial({ color: "#7a5a33", roughness: 0.9 });
  const box = (w, h, d, m, x, y, z, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    g.add(mesh);
    return mesh;
  };
  if (it.shape === "sword") {
    box(0.05, 0.72, 0.1, mat, 0, 0.5, 0);
    box(0.24, 0.06, 0.09, wood, 0, 0.13, 0);
    box(0.07, 0.18, 0.08, wood, 0, 0.02, 0);
  } else if (it.shape === "axe") {
    box(0.06, 0.8, 0.06, wood, 0, 0.3, 0);
    box(0.3, 0.22, 0.07, mat, 0.14, 0.66, 0, 0, 0.35);
  } else if (it.shape === "pick") {
    box(0.06, 0.8, 0.06, wood, 0, 0.3, 0);
    box(0.44, 0.09, 0.07, mat, 0, 0.7, 0, 0, 0.12);
  } else if (it.shape === "spear") {
    box(0.05, 1.3, 0.05, wood, 0, 0.55, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), mat);
    tip.position.y = 1.32;
    g.add(tip);
  } else if (it.shape === "knife") {
    box(0.05, 0.34, 0.08, mat, 0, 0.3, 0);
    box(0.07, 0.16, 0.07, wood, 0, 0.05, 0);
  } else if (it.shape === "shield") {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.08, 6), mat);
    s.rotation.x = Math.PI / 2;
    g.add(s);
    box(0.06, 0.5, 0.06, wood, 0, 0, -0.06);
  } else if (it.shape === "helmet") {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
    g.add(h);
    box(0.5, 0.1, 0.5, mat, 0, -0.03, 0);
  } else if (it.shape === "chest") {
    box(0.56, 0.6, 0.34, mat, 0, 0, 0);
  } else if (it.shape === "pants") {
    box(0.24, 0.6, 0.26, mat, -0.14, -0.3, 0);
    box(0.24, 0.6, 0.26, mat, 0.14, -0.3, 0);
  } else if (it.shape === "boots") {
    box(0.2, 0.24, 0.3, mat, 0, 0.05, 0.05);
  } else if (it.shape === "apple") {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mat);
    g.add(a);
    box(0.03, 0.1, 0.03, wood, 0, 0.15, 0);
  } else if (it.shape === "bread") {
    box(0.4, 0.2, 0.24, mat, 0, 0, 0, 0, 0);
  } else if (it.shape === "meat") {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat);
    m.scale.set(1.3, 0.8, 0.9);
    g.add(m);
    box(0.06, 0.3, 0.06, new THREE.MeshStandardMaterial({ color: "#f0ead6" }), 0.2, 0, 0, 0, 0.6);
  } else if (it.shape === "wood") {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 8), mat);
    c.rotation.z = Math.PI / 2;
    g.add(c);
  } else if (it.shape === "stone") {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), mat);
    g.add(s);
  } else if (it.shape === "fiber") {
    for (let i = -1; i <= 1; i++) box(0.03, 0.4, 0.03, mat, i * 0.06, 0, 0, 0, 0);
  } else if (it.shape === "flint") {
    const f = new THREE.Mesh(new THREE.TetrahedronGeometry(0.17, 0), mat);
    g.add(f);
  } else if (it.shape === "club") {
    box(0.06, 0.46, 0.06, wood, 0, 0.05, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
    head.position.y = 0.42;
    head.scale.set(1, 1.5, 1);
    g.add(head);
  } else if (it.shape === "mace") {
    box(0.06, 0.5, 0.06, wood, 0, 0.06, 0);
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), mat);
    head.position.y = 0.46;
    g.add(head);
  } else if (it.shape === "herb") {
    box(0.03, 0.42, 0.03, new THREE.MeshStandardMaterial({ color: "#4d7a2e", roughness: 0.9 }), 0, 0, 0);
    const leaf = (y, rot) => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.14), mat);
      l.position.y = y;
      l.rotation.y = rot;
      g.add(l);
    };
    leaf(0.1, 0.5);
    leaf(0.0, 2.2);
    leaf(-0.1, 3.6);
  } else if (it.shape === "leather") {
    box(0.46, 0.05, 0.36, mat, 0, 0, 0);
  } else if (it.shape === "rope") {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 18), mat);
    r.rotation.x = Math.PI / 2;
    g.add(r);
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 14), mat);
    r2.rotation.x = Math.PI / 2;
    r2.position.y = 0.06;
    g.add(r2);
  }
  return g;
}

let preview = null;

function createPreview() {
  const canvas = document.getElementById("charView");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.width, canvas.height, false);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(34, canvas.width / canvas.height, 0.1, 20);
  cam.position.set(0, 1.15, 3.6);
  cam.lookAt(0, 1.0, 0);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x35405a, 1.1));
  const key = new THREE.DirectionalLight(0xfff2d0, 1.6);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88b7ff, 0.8);
  rim.position.set(-3, 2, -2);
  scene.add(rim);

  const root = new THREE.Group();
  scene.add(root);
  const cloth = new THREE.MeshStandardMaterial({ color: 0x39527a, roughness: 0.9 });
  const cloth2 = new THREE.MeshStandardMaterial({ color: 0x2c3f5e, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a06b, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 });

  const mk = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  };

  const torso = mk(0.56, 0.66, 0.3, cloth, 0, 1.16, 0);
  const hips = mk(0.5, 0.2, 0.28, cloth2, 0, 0.78, 0);
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  head.add(mk(0.4, 0.42, 0.38, skin, 0, 0.2, 0));
  head.add(mk(0.42, 0.14, 0.4, dark, 0, 0.42, 0));
  const armL = new THREE.Group();
  armL.position.set(-0.36, 1.42, 0);
  armL.add(mk(0.16, 0.56, 0.18, cloth, 0, -0.26, 0));
  armL.add(mk(0.15, 0.14, 0.17, skin, 0, -0.58, 0));
  const armR = new THREE.Group();
  armR.position.set(0.36, 1.42, 0);
  armR.add(mk(0.16, 0.56, 0.18, cloth, 0, -0.26, 0));
  armR.add(mk(0.15, 0.14, 0.17, skin, 0, -0.58, 0));
  const legL = new THREE.Group();
  legL.position.set(-0.14, 0.7, 0);
  legL.add(mk(0.2, 0.62, 0.22, cloth2, 0, -0.3, 0));
  legL.add(mk(0.2, 0.14, 0.3, dark, 0, -0.64, 0.04));
  const legR = new THREE.Group();
  legR.position.set(0.14, 0.7, 0);
  legR.add(mk(0.2, 0.62, 0.22, cloth2, 0, -0.3, 0));
  legR.add(mk(0.2, 0.14, 0.3, dark, 0, -0.64, 0.04));

  const mount = { head, torso, armL, armR, legL, legR };
  const nodeHead = new THREE.Group();
  nodeHead.position.set(0, 0.42, 0);
  head.add(nodeHead);
  const nodeHandR = new THREE.Group();
  nodeHandR.position.set(0, -0.58, 0);
  armR.add(nodeHandR);
  const nodeHandL = new THREE.Group();
  nodeHandL.position.set(0, -0.58, 0);
  armL.add(nodeHandL);

  root.add(torso, hips, head, armL, armR, legL, legR);

  const equipNodes = {
    head: [nodeHead],
    chest: [root],
    legs: [root],
    feet: [legL, legR],
    mainhand: [nodeHandR],
    offhand: [nodeHandL],
  };
  const eqMeshes = { head: [], chest: [], legs: [], feet: [], mainhand: [], offhand: [] };

  function slotPosition(slot, m, i) {
    if (slot === "head") m.position.y = 0.2;
    else if (slot === "chest") m.position.y = 1.16;
    else if (slot === "legs") m.position.y = 0.7;
    else if (slot === "feet") {
      m.position.y = -0.64;
      m.position.z = 0.05;
    } else if (slot === "mainhand") {
      m.rotation.z = -0.25;
      m.position.y = 0.05;
    } else if (slot === "offhand") {
      m.position.set(0, -0.1, 0.12);
    }
  }

  function setEquipment(equip) {
    for (const slot of SLOT_ORDER) {
      const id = equip[slot] || null;
      const prevIds = eqMeshes[slot].map((m) => m.userData.id).filter(Boolean);
      if (prevIds.length === (id ? equipNodes[slot].length : 0) && (!id || prevIds[0] === id)) continue;
      for (const m of eqMeshes[slot]) m.parent && m.parent.remove(m);
      eqMeshes[slot] = [];
      if (!id) continue;
      for (const holder of equipNodes[slot]) {
        const m = buildItemMesh(id);
        m.userData.id = id;
        slotPosition(slot, m);
        holder.add(m);
        eqMeshes[slot].push(m);
      }
    }
  }

  let rotY = 0.5;
  let dragging = false;
  let lastX = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    rotY += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  canvas.addEventListener("pointerup", () => (dragging = false));

  function render(t) {
    if (!dragging) rotY += 0.004;
    root.rotation.y = rotY;
    root.position.y = Math.sin(t * 1.6) * 0.02;
    armL.rotation.x = Math.sin(t * 1.6) * 0.05;
    armR.rotation.x = -Math.sin(t * 1.6) * 0.05;
    renderer.render(scene, cam);
  }

  return { render, setEquipment };
}

let lastRender = 0;
function previewLoop(ts) {
  if (!open || !preview) return;
  if (ts - lastRender > 32) {
    lastRender = ts;
    preview.render(ts / 1000);
  }
  requestAnimationFrame(previewLoop);
}

const gridEl = () => document.getElementById("invGrid");
const creativeEl = () => document.getElementById("creativeGrid");

function slotEl(kind, key) {
  return document.querySelector(`[data-${kind}="${key}"]`);
}

function renderGrid() {
  const grid = gridEl();
  grid.innerHTML = "";
  for (let i = 0; i < loadout.inv.length; i++) {
    const s = loadout.inv[i];
    const d = document.createElement("div");
    d.className = "slot" + (s ? " filled" : "") + (selected && selected.area === "inv" && selected.idx === i ? " sel" : "");
    d.dataset.idx = i;
    if (i < 6) d.classList.add("hot");
    if (s) {
      d.innerHTML = iconSVG(s.id) + (s.count > 1 ? `<span class="cnt">${s.count}</span>` : "");
      d.title = ITEMS[s.id].name;
    }
    grid.appendChild(d);
  }
}

function renderCreative() {
  const grid = creativeEl();
  grid.innerHTML = "";
  for (const id of Object.keys(ITEMS)) {
    const d = document.createElement("div");
    d.className = "slot filled" + (selected && selected.area === "creative" && selected.id === id ? " sel" : "");
    d.dataset.creative = id;
    d.innerHTML = iconSVG(id);
    d.title = ITEMS[id].name + " (click to add)";
    grid.appendChild(d);
  }
}

function renderEquip() {
  for (const slot of SLOT_ORDER) {
    const el = slotEl("slot-equip", slot);
    if (!el) continue;
    const id = loadout.equip[slot];
    el.classList.toggle("filled", !!id);
    el.classList.toggle("sel", !!(selected && selected.area === "equip" && selected.slot === slot));
    el.innerHTML = (id ? iconSVG(id) : "") + `<span class="slot-label">${SLOT_LABELS[slot]}</span>`;
    el.title = id ? ITEMS[id].name + " (click to unequip)" : SLOT_LABELS[slot];
  }
}

function renderInfo() {
  const name = document.getElementById("iiName");
  const desc = document.getElementById("iiDesc");
  const icon = document.getElementById("iiIcon");
  const btnEquip = document.getElementById("btnEquip");
  const btnUse = document.getElementById("btnUse");
  let id = null;
  if (selected && selected.area === "inv") id = loadout.inv[selected.idx]?.id || null;
  else if (selected && selected.area === "equip") id = loadout.equip[selected.slot];
  else if (selected && selected.area === "creative") id = selected.id;
  if (!id) {
    name.textContent = "Nothing selected";
    desc.textContent = tab === "creative" ? "Click an item to add it to your backpack." : "Click an item to inspect it.";
    icon.innerHTML = "";
    btnEquip.style.display = "none";
    btnUse.style.display = "none";
    return;
  }
  const it = ITEMS[id];
  name.textContent = it.name;
  const bits = [];
  if (it.dmg) bits.push(`Damage ${it.dmg}`);
  if (it.armor) bits.push(`Armor +${it.armor}`);
  if (it.food) bits.push(`Hunger +${it.food}`);
  if (it.hp > 0) bits.push(`Health +${it.hp}`);
  bits.push(it.type[0].toUpperCase() + it.type.slice(1));
  desc.innerHTML = `${it.desc}<br><b>${bits.join(" · ")}</b>`;
  icon.innerHTML = iconSVG(id);
  const equippable = !!it.slot && selected.area === "inv";
  const edible = it.type === "food" && selected.area === "inv";
  btnEquip.style.display = equippable ? "" : "none";
  btnUse.style.display = edible ? "" : "none";
  btnUse.textContent = "Eat";
}

function renderHotbar() {
  const bar = document.getElementById("hotbar");
  if (!bar) return;
  bar.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    const s = loadout.inv[i];
    const d = document.createElement("div");
    d.className = "hot-slot" + (loadout.hotbar === i ? " active" : "") + (s ? " filled" : "");
    d.dataset.hot = i;
    if (s) {
      d.innerHTML = iconSVG(s.id) + (s.count > 1 ? `<span class="cnt">${s.count}</span>` : "");
      d.title = ITEMS[s.id].name;
    }
    d.innerHTML += `<span class="key">${i + 1}</span>`;
    bar.appendChild(d);
  }
  onChange();
}

function refresh() {
  if (!document.getElementById("invGrid")) return;
  renderGrid();
  renderEquip();
  renderInfo();
  renderHotbar();
  if (tab === "creative") renderCreative();
  if (preview && open) preview.setEquipment(loadout.equip);
  onChange();
}

function renderSelection() {
  document.querySelectorAll("#invGrid .slot").forEach((el) => {
    const i = +el.dataset.idx;
    el.classList.toggle("sel", !!(selected && selected.area === "inv" && selected.idx === i));
  });
  document.querySelectorAll("#creativeGrid .slot").forEach((el) => {
    el.classList.toggle("sel", !!(selected && selected.area === "creative" && selected.id === el.dataset.creative));
  });
  for (const slot of SLOT_ORDER) {
    const el = slotEl("slot-equip", slot);
    if (el) el.classList.toggle("sel", !!(selected && selected.area === "equip" && selected.slot === slot));
  }
  renderInfo();
}

function selectedFrom(el) {
  if (el.dataset.idx !== undefined) return { area: "inv", idx: +el.dataset.idx };
  if (el.dataset.slotEquip !== undefined) return { area: "equip", slot: el.dataset.slotEquip };
  if (el.dataset.creative) return { area: "creative", id: el.dataset.creative };
  return null;
}

let press = null;

function handlePointerDown(e) {
  const el = e.target.closest(".slot, .equip-slot");
  if (!el) return;
  const sel = selectedFrom(el);
  if (!sel) return;
  press = { sel, x: e.clientX, y: e.clientY, el, dragged: false };
}

function handlePointerMove(e) {
  if (!press) return;
  if (!press.dragged && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 7) {
    press.dragged = true;
    const icon = document.createElement("div");
    icon.id = "dragGhost";
    icon.className = "slot floating";
    const id =
      press.sel.area === "inv"
        ? loadout.inv[press.sel.idx]?.id
        : press.sel.area === "equip"
          ? loadout.equip[press.sel.slot]
          : press.sel.id;
    if (id) icon.innerHTML = iconSVG(id);
    document.body.appendChild(icon);
  }
  const ghost = document.getElementById("dragGhost");
  if (ghost) {
    ghost.style.left = e.clientX - 24 + "px";
    ghost.style.top = e.clientY - 24 + "px";
  }
}

function handlePointerUp(e) {
  if (!press) return;
  const p = press;
  press = null;
  const ghost = document.getElementById("dragGhost");
  if (ghost) ghost.remove();
  const target = document.elementFromPoint(e.clientX, e.clientY);
  const el = target && target.closest ? target.closest(".slot, .equip-slot") : null;

  if (p.dragged && el) {
    const to = selectedFrom(el);
    dropInto(p.sel, to);
    return;
  }
  if (p.dragged) return;

  const now = selectedFrom(p.el);
  if (!now) return;
  if (now.area === "inv" && loadout.inv[now.idx] === null && selected && selected.area === "inv") {
    moveSlot(selected.idx, now.idx);
    selected = now;
    playClick();
    refresh();
    return;
  }
  const t = performance.now();
  const same =
    lastTap &&
    lastTap.area === now.area &&
    lastTap.idx === now.idx &&
    lastTap.slot === now.slot &&
    lastTap.id === now.id;
  if (same && t - lastTap.t < 400) {
    activate(now);
    return;
  }
  lastTap = { t, area: now.area, idx: now.idx, slot: now.slot, id: now.id };
  selected = now;
  playClick();
  renderSelection();
}

function activate(sel) {
  const t = performance.now();
  lastTap = null;
  if (t - lastActivate < 400) return;
  lastActivate = t;
  if (sel.area === "inv") {
    const s = loadout.inv[sel.idx];
    if (!s) return;
    if (ITEMS[s.id].type === "food") eatFromInv(sel.idx);
    else equipFromInv(sel.idx);
  } else if (sel.area === "equip") {
    unequip(sel.slot);
  } else if (sel.area === "creative") {
    addItem(sel.id, ITEMS[sel.id].stack > 1 ? 5 : 1);
  }
}

let lastTap = null;
let lastActivate = 0;

function dropInto(from, to) {
  if (!to) return;
  if (from.area === "creative") {
    if (to.area === "inv") {
      if (!loadout.inv[to.idx]) {
        loadout.inv[to.idx] = makeStack(from.id, ITEMS[from.id].stack > 1 ? Math.min(10, ITEMS[from.id].stack) : 1);
        playPickup();
        refresh();
      } else addItem(from.id, 1);
    } else if (to.area === "equip") {
      if (slotAccepts(to.slot, from.id)) {
        loadout.equip[to.slot] = from.id;
        playEquip(equipKind(from.id));
        refresh();
      } else toast("Wrong slot");
    }
    return;
  }
  if (from.area === "inv" && to.area === "inv") {
    if (from.idx === to.idx) return;
    moveSlot(from.idx, to.idx);
    playClick();
    refresh();
  } else if (from.area === "inv" && to.area === "equip") {
    equipToSlot(from.idx, to.slot);
  } else if (from.area === "equip" && to.area === "inv") {
    const id = loadout.equip[from.slot];
    if (!id) return;
    if (loadout.inv[to.idx]) {
      const other = loadout.inv[to.idx];
      if (!slotAccepts(from.slot, other.id)) {
        toast(`${ITEMS[other.id].name} does not fit ${SLOT_LABELS[from.slot]}`);
        return;
      }
      loadout.equip[from.slot] = other.id;
      loadout.inv[to.idx] = makeStack(id, 1);
      playEquip(equipKind(other.id));
    } else {
      loadout.inv[to.idx] = makeStack(id, 1);
      loadout.equip[from.slot] = null;
      playClick();
    }
    refresh();
  } else if (from.area === "equip" && to.area === "equip") {
    if (from.slot === to.slot) return;
    const id = loadout.equip[from.slot];
    if (!id) return;
    if (!slotAccepts(to.slot, id)) {
      toast(`${ITEMS[id].name} does not fit ${SLOT_LABELS[to.slot]}`);
      return;
    }
    const other = loadout.equip[to.slot];
    loadout.equip[to.slot] = id;
    loadout.equip[from.slot] = other && slotAccepts(from.slot, other) ? other : null;
    if (loadout.equip[from.slot] !== other && other) {
      const idx = loadout.inv.indexOf(null);
      if (idx >= 0) loadout.inv[idx] = makeStack(other, 1);
    }
    playEquip(equipKind(id));
    refresh();
  }
}

function handleDblClick(e) {
  const el = e.target.closest(".slot, .equip-slot");
  if (!el) return;
  const sel = selectedFrom(el);
  if (!sel) return;
  activate(sel);
}

export function toggleBackpack(force) {
  const panel = document.getElementById("backpack");
  const next = force !== undefined ? force : !open;
  if (next === open) return;
  open = next;
  if (open) {
    selected = null;
    tab = "bag";
    document.getElementById("backpack").classList.remove("hidden");
    switchTab("bag");
    if (!preview) preview = createPreview();
    preview.setEquipment(loadout.equip);
    refresh();
    requestAnimationFrame(previewLoop);
    playOpen(true);
  } else {
    panel.classList.add("hidden");
    playOpen(false);
    onChange();
  }
  onToggleCb(open);
}

function switchTab(name) {
  tab = name;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  gridEl().parentElement.classList.toggle("hidden", name !== "bag");
  creativeEl().parentElement.classList.toggle("hidden", name !== "creative");
  selected = null;
  refresh();
}

export function initInventory() {
  const panel = document.getElementById("backpack");
  if (!panel) return;
  panel.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  panel.addEventListener("dblclick", handleDblClick);

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  document.getElementById("invClose").addEventListener("click", () => toggleBackpack(false));
  document.getElementById("btnEquip").addEventListener("click", () => {
    if (selected && selected.area === "inv") equipFromInv(selected.idx);
  });
  document.getElementById("btnUse").addEventListener("click", () => {
    if (selected && selected.area === "inv") eatFromInv(selected.idx);
  });
  document.getElementById("btnDrop").addEventListener("click", dropSelected);
  document.getElementById("hotbar").addEventListener("click", (e) => {
    const s = e.target.closest("[data-hot]");
    if (!s) return;
    loadout.hotbar = +s.dataset.hot;
    playClick();
    renderHotbar();
  });
  renderHotbar();
}
