// src/contracts.js

const CONTRACT_TYPES = ['enemy_killed', 'crystal_collected', 'survive'];

const TYPE_META = {
  enemy_killed:      { unit: 'врагов', titlePrefix: 'Истребитель' },
  crystal_collected: { unit: 'сфер',   titlePrefix: 'Собиратель'   },
  survive:           { unit: 'секунд', titlePrefix: 'Выживший'    },
};

const REWARD_BASE = { enemy_killed: 30, crystal_collected: 25, survive: 40 };

const MAX_TICK_DT = 0.25;
const MAX_SURVIVE_GOAL = 300;
const MAX_OTHER_GOAL = 500;
const MAX_REWARD_XP = 100000;

function safeRng(rng) {
  return typeof rng === 'function' ? rng : Math.random;
}

function nextRand(rng) {
  let v;
  try {
    v = rng();
  } catch {
    v = Math.random();
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return Math.random();
  if (v < 0) v = 0;
  if (v >= 1) v = 0.999999999;
  return v;
}

function randInt(rng, min, max) {
  if (max < min) max = min;
  return Math.floor(nextRand(rng) * (max - min + 1)) + min;
}

function clampInt(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function clampNonNeg(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function normalizeWave(wave) {
  const w = Math.floor(Number(wave));
  if (!Number.isFinite(w) || w < 1) return 1;
  if (w > 1000) return 1000;
  return w;
}

function makeId(type, index) {
  return `${type}_${index}`;
}

function buildTitle(type, goal) {
  const meta = TYPE_META[type];
  return `${meta.titlePrefix}: ${goal} ${meta.unit}`;
}

function createGoal(rng, type, wave) {
  const w = wave;
  if (type === 'enemy_killed') {
    const base = 5 + Math.floor(w * 0.8);
    return Math.min(MAX_OTHER_GOAL, base + randInt(rng, 0, 3));
  }
  if (type === 'crystal_collected') {
    const base = 4 + Math.floor(w * 0.7);
    return Math.min(MAX_OTHER_GOAL, base + randInt(rng, 0, 3));
  }
  // survive
  const base = 20 + Math.floor(w * 1.5);
  return Math.min(MAX_SURVIVE_GOAL, base + randInt(rng, 0, 5));
}

function createRewardXp(type, goal, wave) {
  const base = REWARD_BASE[type] || 25;
  const scaled = base + goal * 0.5 + wave * 2;
  const val = Math.floor(scaled);
  if (val < 1) return 1;
  if (val > MAX_REWARD_XP) return MAX_REWARD_XP;
  return val;
}

function makeContract(rng, type, index, wave) {
  const goal = createGoal(rng, type, wave);
  return {
    id: makeId(type, index),
    type,
    title: buildTitle(type, goal),
    unit: TYPE_META[type].unit,
    goal,
    progress: 0,
    rewardXp: createRewardXp(type, goal, wave),
    rewarded: false,
  };
}

export function createContractState(rng = Math.random, wave = 1) {
  const r = safeRng(rng);
  const w = normalizeWave(wave);

  const contracts = [
    makeContract(r, 'enemy_killed', 0, w),
    makeContract(r, 'crystal_collected', 1, w),
    makeContract(r, 'survive', 2, w),
  ];

  return {
    wave: w,
    contracts,
    totalRewardXp: contracts.reduce((s, c) => s + c.rewardXp, 0),
    completedCount: 0,
  };
}

function cloneContract(c) {
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    unit: c.unit,
    goal: c.goal,
    progress: c.progress,
    rewardXp: c.rewardXp,
    rewarded: c.rewarded,
  };
}

function cloneState(state) {
  return {
    wave: state.wave,
    contracts: state.contracts.map(cloneContract),
    totalRewardXp: state.totalRewardXp,
    completedCount: state.completedCount,
  };
}

function applyProgress(contract, amount) {
  if (contract.rewarded) return { contract, justCompleted: false };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { contract, justCompleted: false };
  }
  const remaining = contract.goal - contract.progress;
  if (remaining <= 0) {
    const updated = cloneContract(contract);
    updated.progress = contract.goal;
    updated.rewarded = true;
    return { contract: updated, justCompleted: true };
  }
  const applied = Math.min(remaining, amount);
  const nextProgress = Math.min(contract.goal, contract.progress + applied);

  const updated = cloneContract(contract);
  updated.progress = nextProgress;
  let justCompleted = false;
  if (nextProgress >= contract.goal && !contract.rewarded) {
    updated.rewarded = true;
    justCompleted = true;
  }
  return { contract: updated, justCompleted };
}

function normalizeEventAmount(amount) {
  if (amount === undefined || amount === null) return 1;
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e6) return 1e6;
  return n;
}

export function applyContractEvent(state, event) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.contracts)) {
    return {
      state:
        state && typeof state === 'object'
          ? cloneState(state)
          : createContractState(),
      completed: [],
    };
  }
  if (!event || typeof event !== 'object') {
    return { state: cloneState(state), completed: [] };
  }
  const { type } = event;
  if (typeof type !== 'string' || !CONTRACT_TYPES.includes(type)) {
    return { state: cloneState(state), completed: [] };
  }
  const amt = normalizeEventAmount(event.amount);
  if (amt <= 0) {
    return { state: cloneState(state), completed: [] };
  }

  const next = cloneState(state);
  const completed = [];

  for (let i = 0; i < next.contracts.length; i++) {
    const c = next.contracts[i];
    if (c.type !== type) continue;
    const res = applyProgress(c, amt);
    next.contracts[i] = res.contract;
    if (res.justCompleted) {
      completed.push(cloneContract(res.contract));
    }
  }

  if (completed.length > 0) {
    next.completedCount = next.contracts.filter((c) => c.rewarded).length;
  }

  return { state: next, completed };
}

export function tickContractState(state, dt) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.contracts)) {
    return {
      state:
        state && typeof state === 'object'
          ? cloneState(state)
          : createContractState(),
      completed: [],
    };
  }

  let delta = Number(dt);
  if (!Number.isFinite(delta) || delta <= 0) {
    return { state: cloneState(state), completed: [] };
  }
  if (delta > MAX_TICK_DT) delta = MAX_TICK_DT;

  const next = cloneState(state);
  const completed = [];

  for (let i = 0; i < next.contracts.length; i++) {
    const c = next.contracts[i];
    if (c.type !== 'survive') continue;
    if (c.rewarded) continue;
    const remaining = c.goal - c.progress;
    if (remaining <= 0) {
      const updated = cloneContract(c);
      updated.progress = c.goal;
      updated.rewarded = true;
      next.contracts[i] = updated;
      completed.push(cloneContract(updated));
      continue;
    }
    const applied = Math.min(remaining, delta);
    const updated = cloneContract(c);
    updated.progress = Math.min(c.goal, c.progress + applied);
    if (updated.progress >= c.goal) {
      updated.rewarded = true;
      completed.push(cloneContract(updated));
    }
    next.contracts[i] = updated;
  }

  if (completed.length > 0) {
    next.completedCount = next.contracts.filter((c) => c.rewarded).length;
  }

  return { state: next, completed };
}

function sanitizeContract(raw, index, seenTypes) {
  if (!raw || typeof raw !== 'object') return null;
  const type = typeof raw.type === 'string' ? raw.type : '';
  if (!CONTRACT_TYPES.includes(type)) return null;
  if (seenTypes.has(type)) return null;

  const maxGoal = type === 'survive' ? MAX_SURVIVE_GOAL : MAX_OTHER_GOAL;
  const fallbackGoal = type === 'survive' ? 30 : 10;
  const goal = clampInt(raw.goal, 1, maxGoal, fallbackGoal);
  const progressRaw = clampNonNeg(raw.progress, 0);
  const progress = Math.min(goal, progressRaw);
  const rewardXp = clampInt(raw.rewardXp, 1, MAX_REWARD_XP, REWARD_BASE[type] || 25);

  const reachedGoal = progress >= goal;
  const wasRewarded = raw.rewarded === true;
  const rewarded = reachedGoal || wasRewarded;

  const id =
    typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 64
      ? raw.id
      : makeId(type, index);

  const title =
    typeof raw.title === 'string' && raw.title.length > 0 && raw.title.length <= 128
      ? raw.title
      : buildTitle(type, goal);

  const unit =
    typeof raw.unit === 'string' && raw.unit.length > 0 && raw.unit.length <= 32
      ? raw.unit
      : TYPE_META[type].unit;

  return {
    id,
    type,
    title,
    unit,
    goal,
    progress,
    rewardXp,
    rewarded,
  };
}

export function sanitizeContractState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.contracts)) {
    return createContractState();
  }

  const wave = normalizeWave(raw.wave);

  const seenTypes = new Set();
  const sanitized = [];
  for (
    let i = 0;
    i < raw.contracts.length && sanitized.length < CONTRACT_TYPES.length;
    i++
  ) {
    const c = sanitizeContract(raw.contracts[i], i, seenTypes);
    if (!c) continue;
    seenTypes.add(c.type);
    sanitized.push(c);
  }

  for (let i = 0; i < CONTRACT_TYPES.length; i++) {
    const t = CONTRACT_TYPES[i];
    if (seenTypes.has(t)) continue;
    const fresh = makeContract(Math.random, t, i, wave);
    sanitized.push(fresh);
    seenTypes.add(t);
  }

  sanitized.sort(
    (a, b) => CONTRACT_TYPES.indexOf(a.type) - CONTRACT_TYPES.indexOf(b.type)
  );

  const completedCount = sanitized.filter((c) => c.rewarded).length;
  const totalRewardXp = sanitized.reduce((s, c) => s + c.rewardXp, 0);

  return {
    wave,
    contracts: sanitized,
    totalRewardXp,
    completedCount,
  };
}

export const CONTRACT_TYPES_LIST = CONTRACT_TYPES.slice();