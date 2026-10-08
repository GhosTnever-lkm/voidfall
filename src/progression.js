/**
 * VOIDFALL — мета-прогрессия (v1).
 *
 * Чистый модуль: никаких DOM-зависимостей, никаких мутаций входных данных.
 * Все функции, меняющие профиль (recordRun, buyRelic), возвращают НОВЫЙ объект профиля.
 * Если операция невозможна (нет эссенции, реликвия уже куплена, неизвестный id) —
 * возвращается эквивалентный профиль без изменений; сравнивайте essence/ownedRelics.
 *
 * Хранилище: localStorage["voidfall.profile.v1"].
 * Любая ошибка localStorage (недоступен, приватный режим, квота) или битый JSON
 * не бросает исключение: loadProfile() отдаёт безопасный дефолтный профиль,
 * saveProfile() возвращает false.
 */

export const STORAGE_KEY = 'voidfall.profile.v1';
export const PROFILE_VERSION = 1;

/** Первая реликвия разблокирована изначально. */
export const BASE_RELIC_ID = 'vital_core';

/** Формула награды за забег. */
export const RUN_REWARD = Object.freeze({
  perWave: 3,   // за каждую пройденную волну
  perKill: 0.5, // за каждое убийство
  perBoss: 25,  // за каждого убитого босса
});

/**
 * Постоянные реликвии.
 * bonuses: [{ stat, mult? , add? }] — применяется к полям BASE_STATS из content.js.
 *   mult — умножение (1.15 = +15%), add — прибавка (0.06 = +6 п.п.).
 */
export const RELICS = Object.freeze([
  Object.freeze({
    id: BASE_RELIC_ID,
    name: 'Ядро жизни',
    desc: '+15% к максимальному здоровью.',
    cost: 0,
    bonuses: Object.freeze([Object.freeze({ stat: 'maxHp', mult: 1.15 })]),
  }),
  Object.freeze({
    id: 'thruster',
    name: 'Ионный ускоритель',
    desc: '+10% к скорости передвижения.',
    cost: 35,
    bonuses: Object.freeze([Object.freeze({ stat: 'moveSpeed', mult: 1.10 })]),
  }),
  Object.freeze({
    id: 'magnet_field',
    name: 'Магнитное поле',
    desc: '+30% к радиусу подбора.',
    cost: 40,
    bonuses: Object.freeze([Object.freeze({ stat: 'magnetRadius', mult: 1.30 })]),
  }),
  Object.freeze({
    id: 'overclock',
    name: 'Разгон',
    desc: '+12% к урону.',
    cost: 55,
    bonuses: Object.freeze([Object.freeze({ stat: 'damage', mult: 1.12 })]),
  }),
  Object.freeze({
    id: 'critical_matrix',
    name: 'Критическая матрица',
    desc: '+6% к шансу критического удара.',
    cost: 80,
    bonuses: Object.freeze([Object.freeze({ stat: 'critChance', add: 0.06 })]),
  }),
]);

/* ─────────────────────────── валидация ─────────────────────────── */

const MAX_INT = 1_000_000_000;
const MAX_BIG = 1_000_000_000_000;

/** Безопасное целое: конечное число → floor и clamp, иначе fallback. */
function toInt(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, Math.floor(n)));
  return Number.isFinite(clamped) ? clamped : fallback;
}

/** Безопасное число (не целое). */
function toNum(value, fallback, min, max) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return Number.isFinite(clamped) ? clamped : fallback;
}

/** Валидный id реликвии? */
export function isRelicId(id) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return false;
  return RELICS.some((r) => r.id === id);
}

/** Реликвия по id или null. */
export function getRelic(id) {
  if (typeof id !== 'string') return null;
  return RELICS.find((r) => r.id === id) || null;
}

/** Список id реликвий: только валидные, без дублей, базовая всегда присутствует. */
function sanitizeRelicIds(value) {
  const out = [];
  if (Array.isArray(value)) {
    for (const raw of value) {
      if (!isRelicId(raw)) continue;
      if (out.includes(raw)) continue;
      out.push(raw);
    }
  }
  if (!out.includes(BASE_RELIC_ID)) out.unshift(BASE_RELIC_ID);
  return out;
}

/** Дефолтный (чистый) профиль. */
export function createDefaultProfile() {
  return {
    version: PROFILE_VERSION,
    essence: 0,
    bestWave: 0,
    bestScore: 0,
    totalRuns: 0,
    totalKills: 0,
    bossesDefeated: 0,
    ownedRelics: [BASE_RELIC_ID],
  };
}

/**
 * Приводит произвольный объект к валидному профилю v1.
 * Неизвестная/отсутствующая версия, не-объект, массив → чистый дефолт.
 */
export function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createDefaultProfile();
  if (raw.version !== PROFILE_VERSION) return createDefaultProfile();

  return {
    version: PROFILE_VERSION,
    essence: toInt(raw.essence, 0, 0, MAX_INT),
    bestWave: toInt(raw.bestWave, 0, 0, MAX_INT),
    bestScore: toInt(raw.bestScore, 0, 0, MAX_BIG),
    totalRuns: toInt(raw.totalRuns, 0, 0, MAX_INT),
    totalKills: toInt(raw.totalKills, 0, 0, MAX_INT),
    bossesDefeated: toInt(raw.bossesDefeated, 0, 0, MAX_INT),
    ownedRelics: sanitizeRelicIds(raw.ownedRelics),
  };
}

/* ─────────────────────────── localStorage ─────────────────────────── */

function getStorage() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    const probe = '__voidfall_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch (_) {
    return null;
  }
}

/** Загрузка профиля. Никогда не бросает. */
export function loadProfile() {
  const storage = getStorage();
  if (!storage) return createDefaultProfile();

  let raw = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (_) {
    return createDefaultProfile();
  }
  if (typeof raw !== 'string' || raw.length === 0) return createDefaultProfile();

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    return createDefaultProfile();
  }
  return sanitizeProfile(parsed);
}

/** Сохранение профиля. Возвращает true/false, никогда не бросает. */
export function saveProfile(profile) {
  const clean = sanitizeProfile(profile);
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(clean));
    return true;
  } catch (_) {
    return false;
  }
}

/* ─────────────────────────── награда и забег ─────────────────────────── */

function readBosses(result) {
  if (!result || typeof result !== 'object') return 0;
  const raw = result.bosses ?? result.bossKills ?? result.bossesDefeated ?? 0;
  return toInt(raw, 0, 0, 10_000);
}

/** Сколько эссенции принесёт забег. Чистая функция. */
export function calcRunReward(result) {
  const r = result && typeof result === 'object' ? result : {};
  const wave = toInt(r.wave, 0, 0, 1_000_000);
  const kills = toInt(r.kills, 0, 0, 1_000_000);
  const bosses = readBosses(r);

  const total = wave * RUN_REWARD.perWave + kills * RUN_REWARD.perKill + bosses * RUN_REWARD.perBoss;
  return toInt(total, 0, 0, MAX_INT);
}

/**
 * Фиксирует результат забега: начисляет эссенцию и обновляет рекорды/статистику.
 * Возвращает НОВЫЙ профиль.
 *
 * result: { score, wave, kills, bosses? } (совместим с callbacks.onGameOver).
 */
export function recordRun(profile, result) {
  const current = sanitizeProfile(profile);
  const r = result && typeof result === 'object' ? result : {};

  const wave = toInt(r.wave, 0, 0, 1_000_000);
  const score = toInt(r.score, 0, 0, MAX_BIG);
  const kills = toInt(r.kills, 0, 0, 1_000_000);
  const bosses = readBosses(r);
  const reward = calcRunReward({ wave, kills, bosses });

  return {
    version: PROFILE_VERSION,
    essence: toInt(current.essence + reward, 0, 0, MAX_INT),
    bestWave: Math.max(current.bestWave, wave),
    bestScore: Math.max(current.bestScore, score),
    totalRuns: toInt(current.totalRuns + 1, 0, 0, MAX_INT),
    totalKills: toInt(current.totalKills + kills, 0, 0, MAX_INT),
    bossesDefeated: toInt(current.bossesDefeated + bosses, 0, 0, MAX_INT),
    ownedRelics: current.ownedRelics.slice(),
  };
}

/* ─────────────────────────── покупки ─────────────────────────── */

/** Можно ли купить реликвию прямо сейчас. */
export function canBuyRelic(profile, id) {
  const relic = getRelic(id);
  if (!relic) return false;
  const current = sanitizeProfile(profile);
  if (current.ownedRelics.includes(relic.id)) return false;
  return current.essence >= relic.cost;
}

/**
 * Покупка реликвии. Возвращает НОВЫЙ профиль.
 * Если id неизвестен, реликвия уже куплена или не хватает эссенции — профиль без изменений.
 */
export function buyRelic(profile, id) {
  const current = sanitizeProfile(profile);
  const relic = getRelic(id);
  if (!relic) return current;
  if (current.ownedRelics.includes(relic.id)) return current;
  if (current.essence < relic.cost) return current;

  return {
    version: PROFILE_VERSION,
    essence: toInt(current.essence - relic.cost, 0, 0, MAX_INT),
    bestWave: current.bestWave,
    bestScore: current.bestScore,
    totalRuns: current.totalRuns,
    totalKills: current.totalKills,
    bossesDefeated: current.bossesDefeated,
    ownedRelics: [...current.ownedRelics, relic.id],
  };
}

/* ─────────────────────────── применение бонусов ─────────────────────────── */

/**
 * Применяет бонусы купленных реликвий к базовым статам.
 * Чистая функция: baseStats не мутируется, возвращается новый объект.
 * Изменяются только уже существующие числовые поля (maxHp, damage, moveSpeed, magnetRadius, critChance).
 * critChance дополнительно зажимается в [0, 1].
 */
export function applyRelics(baseStats, profile) {
  const out = { ...(baseStats && typeof baseStats === 'object' ? baseStats : {}) };
  const current = sanitizeProfile(profile);

  for (const id of current.ownedRelics) {
    const relic = getRelic(id);
    if (!relic) continue;

    for (const bonus of relic.bonuses) {
      if (!bonus || typeof bonus.stat !== 'string') continue;
      const base = out[bonus.stat];
      if (typeof base !== 'number' || !Number.isFinite(base)) continue;

      let value = base;
      if (typeof bonus.mult === 'number' && Number.isFinite(bonus.mult)) value *= bonus.mult;
      if (typeof bonus.add === 'number' && Number.isFinite(bonus.add)) value += bonus.add;

      if (bonus.stat === 'critChance') value = Math.min(1, Math.max(0, value));
      out[bonus.stat] = value;
    }
  }

  return out;
}

/** Суммарная стоимость всех ещё не купленных реликвий (для UI). */
export function totalRemainingCost(profile) {
  const current = sanitizeProfile(profile);
  return RELICS.reduce(
    (sum, r) => (current.ownedRelics.includes(r.id) ? sum : sum + r.cost),
    0
  );
}
