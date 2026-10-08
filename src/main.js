import { Game } from "./game.js";
import { BASE_STATS } from "./content.js";
import { applyRelics, buyRelic, calcRunReward, canBuyRelic, loadProfile, recordRun, RELICS, saveProfile } from "./progression.js";
import { AudioManager } from "./audio.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#game");
const startScreen = $("#start-screen");
const pauseScreen = $("#pause-screen");
const upgradeScreen = $("#upgrade-screen");
const gameOverScreen = $("#gameover-screen");
const shopScreen = $("#shop-screen");
const upgradeOptions = $("#upgrade-options");
const relicOptions = $("#relic-options");
const runState = $("#run-state");
const toast = $("#toast");
const contractList = $("#contract-list");

const formatTime = (seconds = 0) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};

let game = null;
let upgrading = false;
let pausedByPlayer = false;
let toastTimer = 0;
let profile = loadProfile();
const audio = new AudioManager({ enabled: false });

const unlockAudio = () => {
  audio.unlock();
  window.removeEventListener("pointerdown", unlockAudio);
  window.removeEventListener("keydown", unlockAudio);
};
window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

function setVisible(element, visible) {
  element.classList.toggle("hidden", !visible);
}

function showToast(message) {
  toast.textContent = message;
  setVisible(toast, true);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setVisible(toast, false), 1900);
}

function renderProfile() {
  $("#career-essence").textContent = profile.essence.toLocaleString("ru-RU");
  $("#career-best").textContent = `ВОЛНА ${profile.bestWave}`;
  $("#shop-essence").textContent = profile.essence.toLocaleString("ru-RU");
}

function renderShop() {
  relicOptions.replaceChildren();
  for (const relic of RELICS) {
    const owned = profile.ownedRelics.includes(relic.id);
    const card = document.createElement("article");
    card.className = "relic-card";
    card.innerHTML = `<span class="relic-mark">✦</span><span class="relic-copy"><strong></strong><small></small></span><button class="relic-buy" type="button"></button>`;
    card.querySelector(".relic-copy strong").textContent = relic.name;
    card.querySelector(".relic-copy small").textContent = relic.desc;
    const buy = card.querySelector(".relic-buy");
    buy.disabled = owned || !canBuyRelic(profile, relic.id);
    buy.textContent = owned ? "УСТАНОВЛЕНА" : `${relic.cost} ✦`;
    buy.addEventListener("click", () => {
      const next = buyRelic(profile, relic.id);
      if (next.essence === profile.essence && next.ownedRelics.length === profile.ownedRelics.length) return;
      profile = next;
      saveProfile(profile);
      renderProfile();
      renderShop();
      audio.play("ui");
      showToast(`${relic.name} приобретена`);
    });
    relicOptions.append(card);
  }
  renderProfile();
}

function renderState(state) {
  const health = Math.max(0, Math.min(100, (state.hp / Math.max(1, state.maxHp)) * 100));
  const xp = Math.max(0, Math.min(100, (state.xp / Math.max(1, state.xpToNext)) * 100));
  $("#health-value").innerHTML = `${Math.round(state.hp)} <small>/ ${Math.round(state.maxHp)}</small>`;
  $("#health-fill").style.width = `${health}%`;
  $("#level-value").textContent = `УР. ${state.level}`;
  $("#xp-fill").style.width = `${xp}%`;
  $("#wave-value").textContent = String(state.wave).padStart(2, "0");
  $("#wave-caption").textContent = state.wave ? "СЕКТОР АКТИВЕН" : "ПОДГОТОВКА";
  $("#time-value").textContent = formatTime(state.time);
  $("#enemy-value").textContent = String(state.enemies ?? 0).padStart(2, "0");
  $("#kill-value").textContent = String(state.kills).padStart(2, "0");
  renderContracts(state.contracts || []);
  $("#damage-value").textContent = Math.round(state.damage ?? 12);
  $("#fire-rate").textContent = Number(state.fireRate ?? 1).toFixed(1);
  $("#speed-value").textContent = `${Math.round((state.speedMultiplier ?? 1) * 100)}%`;
  for (const [uiId, id] of [["phaseShift", "phase_shift"], ["voidNova", "void_nova"], ["timeFold", "time_fold"]]) {
    const button = document.querySelector(`[data-ability="${uiId}"]`);
    const label = $(`#cooldown-${uiId}`);
    const left = Math.max(0, state.abilities?.[id] || 0);
    button.disabled = left > 0 || !!state.paused || !!state.gameOver || !!state.menu;
    button.classList.toggle("ready", !button.disabled);
    label.textContent = left > 0 ? `${left.toFixed(1)}с` : "ГОТОВ";
  }
  $("#ability-bar").classList.toggle("time-fold-active", !!state.timeFold?.active);
  runState.classList.toggle("active", !state.paused && !state.gameOver && !state.menu);
  runState.innerHTML = state.menu
    ? "<i></i> ОЖИДАНИЕ"
    : state.paused
      ? "<i></i> ПАУЗА"
      : state.gameOver
        ? "<i></i> СВЯЗЬ ПРЕРВАНА"
        : "<i></i> В БОЮ";
}

function renderContracts(contracts) {
  const signature = contracts.map((contract) => contract.id).join("|");
  if (contractList.dataset.signature !== signature) {
    contractList.replaceChildren();
    contractList.dataset.signature = signature;
    for (const contract of contracts) {
      const row = document.createElement("article");
      row.className = "contract-row";
      row.dataset.contractId = contract.id;
      row.innerHTML = `<div class="contract-heading"><strong></strong><span></span></div><div class="contract-meter"><i></i></div><small></small>`;
      contractList.append(row);
    }
    if (!contracts.length) {
      const empty = document.createElement("p");
      empty.className = "contract-empty";
      empty.textContent = "Контракты появятся в начале миссии.";
      contractList.append(empty);
    }
  }
  for (const contract of contracts) {
    const row = contractList.querySelector(`[data-contract-id="${contract.id}"]`);
    if (!row) continue;
    const value = Math.floor(contract.progress);
    row.querySelector(".contract-heading strong").textContent = contract.title;
    row.querySelector(".contract-heading span").textContent = contract.rewarded ? "ВЫПОЛНЕН" : `${value}/${contract.goal} ${contract.unit}`;
    row.querySelector(".contract-meter i").style.width = `${Math.min(100, 100 * contract.progress / contract.goal)}%`;
    row.querySelector("small").textContent = contract.rewarded ? `Награда получена · +${contract.rewardXp} опыта` : `Награда · +${contract.rewardXp} опыта`;
    row.classList.toggle("complete", contract.rewarded);
  }
}

function renderMenuState() {
  const stats = applyRelics(BASE_STATS, profile);
  renderState({ hp:stats.maxHp, maxHp:stats.maxHp, level:1, xp:0, xpToNext:6, wave:0, score:0, time:0, kills:0, enemies:0, damage:stats.damage, fireRate:stats.fireRate, speedMultiplier:1, paused:false, gameOver:false, menu:true });
}

function createGame() {
  game?.destroy();
  game = new Game(canvas, {
    stats: applyRelics(BASE_STATS, profile),
    onSound: (name) => audio.play(name),
    onStateChange: renderState,
    onContractComplete(contract) {
      audio.play("levelup");
      showToast(`Контракт выполнен: ${contract.title} · +${contract.rewardXp} опыта`);
    },
    onLevelUp(choices, choose) {
      upgrading = true;
      pausedByPlayer = false;
      upgradeOptions.replaceChildren();
      for (const choice of choices) {
        const card = document.createElement("button");
        card.className = "upgrade-card";
        card.type = "button";
        card.innerHTML = `<span class="upgrade-icon">✦</span><strong></strong><small></small>`;
        card.querySelector("strong").textContent = choice.name;
        card.querySelector("small").textContent = choice.desc;
        card.addEventListener("click", () => {
          upgrading = false;
          setVisible(upgradeScreen, false);
          audio.play("ui");
          choose(choice.id);
          showToast(`${choice.name} установлено`);
        }, { once: true });
        upgradeOptions.append(card);
      }
      setVisible(upgradeScreen, true);
    },
    onGameOver(stats) {
      upgrading = false;
      pausedByPlayer = false;
      setVisible(upgradeScreen, false);
      const reward = calcRunReward(stats);
      profile = recordRun(profile, stats);
      saveProfile(profile);
      renderProfile();
      $("#final-stats").textContent = `Ты продержался ${formatTime(stats.time)} · волна ${stats.wave} · устранено ${stats.kills} · +${reward} эссенции`;
      setVisible(gameOverScreen, true);
    },
  });
  game.start();
}

function beginRun() {
  audio.unlock();
  audio.play("ui");
  setVisible(startScreen, false);
  setVisible(gameOverScreen, false);
  setVisible(pauseScreen, false);
  setVisible(upgradeScreen, false);
  setVisible(shopScreen, false);
  upgrading = false;
  pausedByPlayer = false;
  createGame();
}

renderProfile();
renderShop();
renderMenuState();

$("#start-button").addEventListener("click", beginRun);
$("#restart-button").addEventListener("click", beginRun);
$("#hangar-button").addEventListener("click", () => {
  game?.destroy();
  game = null;
  setVisible(gameOverScreen, false);
  setVisible(startScreen, true);
  renderProfile();
  renderMenuState();
  audio.play("ui");
});
$("#shop-open-button").addEventListener("click", () => {
  audio.play("ui");
  renderShop();
  setVisible(startScreen, false);
  setVisible(shopScreen, true);
});
$("#shop-close-button").addEventListener("click", () => {
  audio.play("ui");
  setVisible(shopScreen, false);
  setVisible(startScreen, true);
});
$("#pause-button").addEventListener("click", () => {
  if (!game || upgrading || game.gameOver) return;
  pausedByPlayer = !pausedByPlayer;
  game.paused = pausedByPlayer;
  audio.play("ui");
  setVisible(pauseScreen, pausedByPlayer);
  renderState({ ...game.getState?.(), paused: pausedByPlayer, gameOver: game.gameOver });
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !game || upgrading || game.gameOver) return;
  pausedByPlayer = !pausedByPlayer;
  game.paused = pausedByPlayer;
  audio.play("ui");
  setVisible(pauseScreen, pausedByPlayer);
  if (game.getState) renderState({ ...game.getState(), paused: pausedByPlayer, gameOver: game.gameOver });
});

$("#sound-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const enabled = audio.toggle();
  button.dataset.enabled = String(enabled);
  button.setAttribute("aria-label", enabled ? "Звук включён" : "Звук выключен");
  button.title = enabled ? "Звук включён" : "Звук выключен";
  button.style.color = enabled ? "var(--cyan)" : "var(--muted)";
  audio.play("ui");
  showToast(enabled ? "Звук интерфейса включён" : "Звук выключен");
});

document.querySelectorAll("[data-ability]").forEach((button) => {
  button.addEventListener("click", () => {
    if (game?.activateAbility(button.dataset.ability)) audio.play("ui");
  });
});

window.addEventListener("beforeunload", () => { game?.destroy(); audio.destroy(); }, { once: true });

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}
