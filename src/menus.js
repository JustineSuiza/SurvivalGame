import { setVolumes, setMute, isMuted, playClick, playDeath } from "./audio.js";

const KEY = "widelands.settings";

export const settings = {
  master: 85,
  sfx: 100,
  amb: 100,
  music: 65,
  mute: false,
  sens: 100,
  fov: 74,
  shadows: true,
  minimap: true,
  mode: "survival",
};

let handlers = { onResume: () => {}, onQuit: () => {}, onMode: () => {}, onReset: () => {}, onRespawn: () => {} };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) {
    /* ignore */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) {
    /* ignore */
  }
}

export function applySettings() {
  setVolumes({
    master: settings.master / 100,
    sfx: settings.sfx / 100,
    ambience: settings.amb / 100,
    music: settings.music / 100,
  });
  if (settings.mute !== isMuted()) setMute(settings.mute);
  saveSettings();
}

function bindRange(id, valId, key, fmt, after) {
  const el = document.getElementById(id);
  const lab = document.getElementById(valId);
  if (!el) return;
  el.value = settings[key];
  lab.textContent = fmt(settings[key]);
  el.addEventListener("input", () => {
    settings[key] = +el.value;
    lab.textContent = fmt(settings[key]);
    applySettings();
    if (after) after();
  });
}

function bindCheck(id, key, after) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = settings[key];
  el.addEventListener("change", () => {
    settings[key] = el.checked;
    applySettings();
    if (after) after();
  });
}

export function setMode(mode, notify = true) {
  settings.mode = mode;
  const sel = document.getElementById("sMode");
  if (sel) sel.value = mode;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  document.getElementById("modeNote").textContent =
    mode === "survival"
      ? "Survival: hunger, health, fall damage and wolves."
      : "Creative: flying, no damage, full creative inventory.";
  applySettings();
  if (notify) handlers.onMode(mode);
}

export function showPause() {
  document.getElementById("pause").classList.remove("hidden");
  document.getElementById("settings").classList.add("hidden");
}

export function hidePause() {
  document.getElementById("pause").classList.add("hidden");
}

export function showDeath(reason) {
  document.getElementById("deathReason").textContent = reason;
  document.getElementById("death").classList.remove("hidden");
  playDeath();
}

export function hideDeath() {
  document.getElementById("death").classList.add("hidden");
}

export function initMenus(opts) {
  Object.assign(handlers, opts);
  loadSettings();

  bindRange("sMaster", "vMaster", "master", (v) => v + "%");
  bindRange("sSfx", "vSfx", "sfx", (v) => v + "%");
  bindRange("sAmb", "vAmb", "amb", (v) => v + "%");
  bindRange("sMusic", "vMusic", "music", (v) => v + "%");
  bindRange("sSens", "vSens", "sens", (v) => v + "%");
  bindRange("sFov", "vFov", "fov", (v) => String(v));
  bindCheck("sMute", "mute");
  bindCheck("sShadows", "shadows");
  bindCheck("sMinimap", "minimap");
  applySettings();

  document.getElementById("sMode").addEventListener("change", (e) => setMode(e.target.value));

  document.querySelectorAll(".mode-btn").forEach((b) => {
    b.addEventListener("click", () => {
      playClick();
      setMode(b.dataset.mode);
    });
  });

  document.getElementById("btnResume").addEventListener("click", () => {
    playClick();
    handlers.onResume();
  });
  document.getElementById("btnSettings").addEventListener("click", () => {
    playClick();
    document.getElementById("settings").classList.toggle("hidden");
  });
  document.getElementById("btnSettingsBack").addEventListener("click", () => {
    playClick();
    document.getElementById("settings").classList.add("hidden");
  });
  document.getElementById("btnQuit").addEventListener("click", () => {
    playClick();
    handlers.onQuit();
  });
  document.getElementById("btnResetWorld").addEventListener("click", () => {
    playClick();
    handlers.onReset();
  });
  document.getElementById("btnRespawn").addEventListener("click", () => {
    playClick();
    handlers.onRespawn();
  });

  document.getElementById("modeNote").textContent =
    settings.mode === "survival"
      ? "Survival: hunger, health, fall damage and wolves."
      : "Creative: flying, no damage, full creative inventory.";
  document.getElementById("sMode").value = settings.mode;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === settings.mode));
}
