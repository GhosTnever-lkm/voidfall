// src/content.js
// Контентный модуль Voidfall. Только данные и чистые функции.
// Движок сам реализует игровой цикл, рендеринг, ИИ и коллизии.

/* ============================================================
 * 1. АРЕНА И ПАЛИТРА
 * ========================================================== */

export const ARENA = Object.freeze({
  width: 960,
  height: 600,
  margin: 24,
  spawnPadding: 40, // враги появляются за границей на это расстояние
});

export const PALETTE = Object.freeze({
  void:        '#05050c',
  voidDeep:    '#0b0b1a',
  grid:        '#151533',
  gridAccent:  '#232357',
  border:      '#4a3fa0',

  player:        '#6fe3ff',
  playerCore:    '#e9fbff',
  playerTrail:   '#2a7fa8',
  projectile:    '#b8f5ff',
  enemyProjectile: '#ff8a5c',

  hpGood: '#4dffa6',
  hpBad:  '#ff4d6d',
  hpBack: '#1a1a2e',

  xp:     '#ffd166',
  xpGlow: '#ffa53b',

  elite: '#ffe066',
  boss:  '#ff3d6e',

  textPrimary:   '#e8ecff',
  textSecondary: '#9aa3c7',

  ui:       '#1a1a33',
  uiBorder: '#3d3d7a',

  category: Object.freeze({
    weapon: '#ff9f68',
    speed:  '#6fe3ff',
    health: '#4dffa6',
    pickup: '#ffd166',
  }),
});

/* ============================================================
 * 2. БАЗОВЫЕ СТАТЫ ИГРОКА
 * ========================================================== */

export const BASE_STATS = Object.freeze({
  maxHp: 100,
  moveSpeed: 190,          // px/сек
  damage: 10,
  fireRate: 2.2,           // выстрелов в секунду
  projectileSpeed: 520,    // px/сек
  projectileCount: 1,
  projectileRadius: 4,
  projectileLife: 1.1,     // сек
  spread: 0,               // радианы, суммарный разброс между снарядами
  pierce: 0,               // сколько целей пробивает снаряд
  critChance: 0.05,
  critMult: 2.0,
  armor: 0,                // плоское снижение урона
  regen: 0,                // HP/сек
  lifesteal: 0,            // доля нанесённого урона в HP
  magnetRadius: 70,
  pickupSpeed: 260,        // px/сек притяжения сфер
  xpGain: 1.0,
  dashCooldown: 2.5,
  invulnAfterHit: 0.6,
});

/* ============================================================
 * 3. УЛУЧШЕНИЯ (16 шт., 4 категории)
 * apply(stats) -> новый объект stats (чистая функция)
 * ========================================================== */

export const UPGRADES = Object.freeze([
  /* --- ОРУЖИЕ --- */
  {
    id: 'dmg_up',
    name: 'Осколочный заряд',
    desc: 'Урон снарядов +18%.',
    category: 'weapon',
    maxStacks: 5,
    weight: 12,
    apply: (s) => ({ ...s, damage: s.damage * 1.18 }),
  },
  {
    id: 'rate_up',
    name: 'Ускоритель',
    desc: 'Скорость стрельбы +15%.',
    category: 'weapon',
    maxStacks: 5,
    weight: 12,
    apply: (s) => ({ ...s, fireRate: s.fireRate * 1.15 }),
  },
  {
    id: 'multishot',
    name: 'Расщепитель',
    desc: '+1 снаряд за выстрел, растёт разброс.',
    category: 'weapon',
    maxStacks: 3,
    weight: 4,
    apply: (s) => ({
      ...s,
      projectileCount: s.projectileCount + 1,
      spread: Math.min(0.6, s.spread + 0.13),
    }),
  },
  {
    id: 'pierce',
    name: 'Бронебой',
    desc: 'Снаряды пробивают +1 цель.',
    category: 'weapon',
    maxStacks: 3,
    weight: 5,
    apply: (s) => ({ ...s, pierce: s.pierce + 1 }),
  },
  {
    id: 'crit',
    name: 'Точный резонанс',
    desc: 'Шанс критического удара +6%.',
    category: 'weapon',
    maxStacks: 5,
    weight: 8,
    apply: (s) => ({ ...s, critChance: Math.min(0.85, s.critChance + 0.06) }),
  },
  {
    id: 'critdmg',
    name: 'Смертельный импульс',
    desc: 'Критический урон +25%.',
    category: 'weapon',
    maxStacks: 4,
    weight: 6,
    apply: (s) => ({ ...s, critMult: s.critMult + 0.25 }),
  },
  {
    id: 'projspeed',
    name: 'Разгон снаряда',
    desc: 'Скорость снарядов +15%.',
    category: 'weapon',
    maxStacks: 3,
    weight: 7,
    apply: (s) => ({ ...s, projectileSpeed: s.projectileSpeed * 1.15 }),
  },

  /* --- СКОРОСТЬ --- */
  {
    id: 'movespeed',
    name: 'Лёгкие ноги',
    desc: 'Скорость передвижения +10%.',
    category: 'speed',
    maxStacks: 5,
    weight: 11,
    apply: (s) => ({ ...s, moveSpeed: s.moveSpeed * 1.10 }),
  },
  {
    id: 'dash',
    name: 'Фазовый рывок',
    desc: 'Перезарядка рывка -12%.',
    category: 'speed',
    maxStacks: 4,
    weight: 7,
    apply: (s) => ({ ...s, dashCooldown: Math.max(0.4, s.dashCooldown * 0.88) }),
  },

  /* --- ЗДОРОВЬЕ --- */
  {
    id: 'maxhp',
    name: 'Плотный каркас',
    desc: 'Максимум здоровья +20.',
    category: 'health',
    maxStacks: 6,
    weight: 10,
    apply: (s) => ({ ...s, maxHp: s.maxHp + 20 }),
  },
  {
    id: 'regen',
    name: 'Регенератор',
    desc: 'Восстановление +0.6 HP/сек.',
    category: 'health',
    maxStacks: 5,
    weight: 7,
    apply: (s) => ({ ...s, regen: s.regen + 0.6 }),
  },
  {
    id: 'armor',
    name: 'Бронепластины',
    desc: 'Броня +1 (плоское снижение урона).',
    category: 'health',
    maxStacks: 4,
    weight: 6,
    apply: (s) => ({ ...s, armor: s.armor + 1 }),
  },
  {
    id: 'lifesteal',
    name: 'Вампиризм',
    desc: '2% нанесённого урона возвращается здоровьем.',
    category: 'health',
    maxStacks: 4,
    weight: 4,
    apply: (s) => ({ ...s, lifesteal: s.lifesteal + 0.02 }),
  },

  /* --- ПОДБОР ОПЫТА --- */
  {
    id: 'magnet',
    name: 'Магнитное поле',
    desc: 'Радиус подбора опыта +25%.',
    category: 'pickup',
    maxStacks: 5,
    weight: 9,
    apply: (s) => ({ ...s, magnetRadius: s.magnetRadius * 1.25 }),
  },
  {
    id: 'xpgain',
    name: 'Усилитель опыта',
    desc: 'Получаемый опыт +12%.',
    category: 'pickup',
    maxStacks: 5,
    weight: 8,
    apply: (s) => ({ ...s, xpGain: s.xpGain + 0.12 }),
  },
  {
    id: 'pickupspeed',
    name: 'Притяжение',
    desc: 'Скорость притяжения сфер +20%.',
    category: 'pickup',
    maxStacks: 3,
    weight: 6,
    apply: (s) => ({ ...s, pickupSpeed: s.pickupSpeed * 1.20 }),
  },
]);

/* ============================================================
 * 4. АРХЕТИПЫ ВРАГОВ
 * behavior — строка-подсказка для ИИ движка.
 * ========================================================== */

export const ENEMIES = Object.freeze({
  drone: Object.freeze({
    id: 'drone',
    name: 'Дрон',
    desc: 'Быстрый осколок Бездны. Летит напрямик, бьёт в упор.',
    behavior: 'chase',
    radius: 10,
    hp: 12,
    speed: 118,
    damage: 8,
    xp: 1,
    color: '#7bf1a8',
    glow: '#2e8f5c',
    contactCooldown: 0.5,
  }),

  shooter: Object.freeze({
    id: 'shooter',
    name: 'Стрелок',
    desc: 'Держит дистанцию ~240px и стреляет одиночными снарядами.',
    behavior: 'kite',
    radius: 12,
    hp: 18,
    speed: 72,
    damage: 6,
    xp: 2,
    color: '#ff9f68',
    glow: '#a35a2c',
    contactCooldown: 0.6,
    preferredRange: 240,
    retreatRange: 170,
    fireRate: 0.9,
    projectileSpeed: 240,
    projectileDamage: 8,
    projectileRadius: 5,
    aimJitter: 0.10,
  }),

  tank: Object.freeze({
    id: 'tank',
    name: 'Громила',
    desc: 'Медленный, толстый. Раз в ~3 сек делает рывок-таран.',
    behavior: 'charger',
    radius: 20,
    hp: 70,
    speed: 48,
    damage: 18,
    xp: 4,
    color: '#c76bff',
    glow: '#6a2fa0',
    contactCooldown: 0.8,
    chargeCooldown: 3.2,
    chargeTelegraph: 0.55,
    chargeSpeed: 320,
    chargeDuration: 0.55,
    chargeDamage: 22,
  }),

  splitter: Object.freeze({
    id: 'splitter',
    name: 'Роевик',
    desc: 'При смерти распадается на трёх дронов.',
    behavior: 'split',
    radius: 18,
    hp: 30,
    speed: 88,
    damage: 10,
    xp: 3,
    color: '#ff6ba8',
    glow: '#a3325e',
    contactCooldown: 0.6,
    splitInto: 'drone',
    splitCount: 3,
    splitHpScale: 0.55,
    splitSpeedScale: 1.15,
    splitSpawnRadius: 22,
  }),
});

export const ENEMY_IDS = Object.freeze(Object.keys(ENEMIES));

/* ============================================================
 * 5. ПРАВИЛА ЭСКАЛАЦИИ ВОЛН
 * ========================================================== */

export const WAVES = Object.freeze({
  bossEvery: 5,           // босс каждые N волн
  baseBudget: 7,          // бюджет спавна на 1-й волне
  budgetGrowth: 2.4,      // прирост бюджета за волну
  hpGrowth: 0.17,         // +17% HP моба за волну (линейно)
  speedGrowth: 0.028,     // +2.8% скорости за волну
  speedCap: 1.55,         // потолок множителя скорости
  eliteBase: 0.02,
  eliteGrowth: 0.015,
  eliteCap: 0.30,
  spawnInterval: 0.55,    // сек между порциями спавна
  spawnBatchSize: 3,      // мобов за порцию
  breakDuration: 3.5,     // пауза между волнами, сек

  elite: Object.freeze({
    hpMult: 2.4,
    speedMult: 1.10,
    damageMult: 1.5,
    radiusMult: 1.25,
    xpMult: 3,
    color: PALETTE.elite,
  }),
});

// Стоимость и волна разблокировки каждого типа.
export const ENEMY_COST = Object.freeze({ drone: 1, shooter: 2, tank: 4, splitter: 3 });
export const ENEMY_UNLOCK = Object.freeze({ drone: 1, shooter: 2, tank: 3, splitter: 4 });

/* ============================================================
 * 6. БОССЫ
 * Атаки — данные. pattern интерпретируется движком.
 * ========================================================== */

export const BOSSES = Object.freeze([
  Object.freeze({
    id: 'devourer',
    name: 'Пожиратель',
    title: 'Первый страж Бездны',
    hp: 900,
    radius: 34,
    speed: 62,
    contactDamage: 22,
    xp: 60,
    color: '#ff5d73',
    glow: '#7a1428',
    introDuration: 1.6,
    attacks: Object.freeze([
      Object.freeze({
        id: 'radial_burst',
        name: 'Кольцо шипов',
        pattern: 'ring',
        cooldown: 3.0,
        telegraph: 0.7,
        projectileCount: 16,
        projectileSpeed: 220,
        projectileDamage: 10,
        projectileRadius: 5,
        projectileLife: 3.5,
      }),
      Object.freeze({
        id: 'summon_brood',
        name: 'Выводок',
        pattern: 'summon',
        cooldown: 8.5,
        telegraph: 1.0,
        summonType: 'drone',
        summonCount: 5,
        summonSpread: 90,
      }),
      Object.freeze({
        id: 'charge_slam',
        name: 'Таран',
        pattern: 'charge',
        cooldown: 6.0,
        telegraph: 0.6,
        speed: 380,
        duration: 0.8,
        damage: 26,
      }),
    ]),
  }),

  Object.freeze({
    id: 'rift',
    name: 'Разлом',
    title: 'Ткач трещин',
    hp: 1100,
    radius: 30,
    speed: 78,
    contactDamage: 18,
    xp: 80,
    color: '#6fd8ff',
    glow: '#1d4f7a',
    introDuration: 1.6,
    attacks: Object.freeze([
      Object.freeze({
        id: 'laser_sweep',
        name: 'Развёртка луча',
        pattern: 'sweep',
        cooldown: 5.5,
        telegraph: 0.9,
        beamLength: 700,
        beamWidth: 12,
        sweepAngle: Math.PI * 0.75,
        sweepDuration: 1.4,
        damage: 20,
      }),
      Object.freeze({
        id: 'blink',
        name: 'Смещение',
        pattern: 'teleport',
        cooldown: 4.0,
        telegraph: 0.4,
        minDistance: 180,
        maxDistance: 300,
        burstOnArrive: 6,
        burstSpeed: 200,
        burstDamage: 9,
      }),
      Object.freeze({
        id: 'spiral_volley',
        name: 'Спиральный залп',
        pattern: 'spiral',
        cooldown: 7.0,
        telegraph: 0.8,
        arms: 3,
        shots: 12,
        shotInterval: 0.09,
        angleStep: 0.55,
        projectileSpeed: 210,
        projectileDamage: 9,
        projectileRadius: 5,
      }),
    ]),
  }),

  Object.freeze({
    id: 'void_core',
    name: 'Ядро Бездны',
    title: 'Сердце пустоты',
    hp: 1400,
    radius: 36,
    speed: 52,
    contactDamage: 26,
    xp: 110,
    color: '#c76bff',
    glow: '#3d1266',
    introDuration: 1.8,
    attacks: Object.freeze([
      Object.freeze({
        id: 'spiral_storm',
        name: 'Спиральная буря',
        pattern: 'spiral',
        cooldown: 6.0,
        telegraph: 0.8,
        arms: 4,
        shots: 16,
        shotInterval: 0.07,
        angleStep: 0.42,
        projectileSpeed: 190,
        projectileDamage: 11,
        projectileRadius: 5,
      }),
      Object.freeze({
        id: 'shockwave',
        name: 'Ударная волна',
        pattern: 'shockwave',
        cooldown: 7.5,
        telegraph: 1.0,
        rings: 3,
        ringInterval: 0.35,
        startRadius: 40,
        endRadius: 520,
        expandSpeed: 260,
        thickness: 14,
        damage: 18,
      }),
      Object.freeze({
        id: 'gravity_well',
        name: 'Гравитационный колодец',
        pattern: 'pull',
        cooldown: 9.0,
        telegraph: 1.2,
        duration: 2.0,
        pullRadius: 380,
        pullStrength: 180,
        tickDamage: 4,
        tickInterval: 0.35,
      }),
    ]),
  }),
]);

export const BOSS_IDS = Object.freeze(BOSSES.map((b) => b.id));

/* ============================================================
 * 7. ЧИСТЫЕ ФУНКЦИИ API
 * ========================================================== */

/**
 * Состав волны. Чистая (при переданном rng).
 * @param {number} wave   номер волны, начиная с 1
 * @param {() => number} rng  генератор [0,1)
 * @returns {{
 *   wave: number,
 *   isBossWave: boolean,
 *   budget: number,
 *   hpMultiplier: number,
 *   speedMultiplier: number,
 *   eliteChance: number,
 *   spawns: {type: string, count: number}[],
 *   totalEnemies: number,
 *   spawnInterval: number,
 *   spawnBatchSize: number,
 *   breakDuration: number,
 *   boss: (object|null)
 * }}
 */
export function getWavePlan(wave, rng = Math.random) {
  const w = Math.max(1, Math.floor(wave));
  const isBossWave = w % WAVES.bossEvery === 0;

  const budget = Math.round(WAVES.baseBudget + WAVES.budgetGrowth * (w - 1));
  const hpMultiplier = 1 + WAVES.hpGrowth * (w - 1);
  const speedMultiplier = Math.min(
    WAVES.speedCap,
    1 + WAVES.speedGrowth * (w - 1)
  );
  const eliteChance = Math.min(
    WAVES.eliteCap,
    WAVES.eliteBase + WAVES.eliteGrowth * (w - 1)
  );

  const spawns = isBossWave ? [] : allocateSpawns(w, budget, rng);
  const totalEnemies = spawns.reduce((sum, s) => sum + s.count, 0);

  return {
    wave: w,
    isBossWave,
    budget,
    hpMultiplier,
    speedMultiplier,
    eliteChance,
    spawns,
    totalEnemies,
    spawnInterval: WAVES.spawnInterval,
    spawnBatchSize: WAVES.spawnBatchSize,
    breakDuration: WAVES.breakDuration,
    boss: isBossWave ? getBossForWave(w) : null,
  };
}

/**
 * Разбивка бюджета волны по типам врагов.
 * Чистая функция (использует только переданный rng).
 */
function allocateSpawns(wave, budget, rng) {
  const weights = enemyWeightsForWave(wave);
  const types = Object.keys(weights);
  const counts = Object.create(null);
  let left = budget;
  let guard = 512;

  while (left > 0 && guard-- > 0) {
    const affordable = types.filter((t) => ENEMY_COST[t] <= left);
    if (affordable.length === 0) break;

    let total = 0;
    for (const t of affordable) total += weights[t];

    let r = rng() * total;
    let chosen = affordable[affordable.length - 1];
    for (const t of affordable) {
      r -= weights[t];
      if (r <= 0) { chosen = t; break; }
    }

    counts[chosen] = (counts[chosen] || 0) + 1;
    left -= ENEMY_COST[chosen];
  }

  return Object.keys(counts).map((type) => ({ type, count: counts[type] }));
}

/** Веса типов врагов для конкретной волны. Чистая. */
export function enemyWeightsForWave(wave) {
  const w = { drone: 6 };
  if (wave >= ENEMY_UNLOCK.shooter) w.shooter = 3 + Math.min(3, wave * 0.20);
  if (wave >= ENEMY_UNLOCK.tank)    w.tank    = 2 + Math.min(2, wave * 0.15);
  if (wave >= ENEMY_UNLOCK.splitter) w.splitter = 2 + Math.min(3, wave * 0.20);
  if (wave >= 6) w.drone += 2;
  if (wave >= 9) w.tank += 1;
  return w;
}

/**
 * Босс для волны. Каждые WAVES.bossEvery волн — следующий по циклу,
 * после полного круга HP масштабируется.
 */
export function getBossForWave(wave) {
  const index = Math.floor(wave / WAVES.bossEvery) - 1;
  const safeIndex = ((index % BOSSES.length) + BOSSES.length) % BOSSES.length;
  const cycle = Math.floor(index / BOSSES.length);
  const hpScale = 1 + cycle * 0.75;
  const boss = BOSSES[safeIndex];
  return {
    ...boss,
    cycle,
    hpScale,
    hp: Math.round(boss.hp * hpScale),
    contactDamage: Math.round(boss.contactDamage * (1 + cycle * 0.35)),
  };
}

/**
 * Итоговые статы врага с учётом масштаба волны и элитности.
 * Чистая функция, возвращает новый объект.
 */
export function getEnemyStats(type, plan, isElite = false) {
  const base = ENEMIES[type];
  if (!base) throw new Error(`Unknown enemy type: ${type}`);
  const e = WAVES.elite;
  return {
    ...base,
    elite: isElite,
    hp: Math.round(base.hp * plan.hpMultiplier * (isElite ? e.hpMult : 1)),
    speed: base.speed * plan.speedMultiplier * (isElite ? e.speedMult : 1),
    damage: base.damage * (isElite ? e.damageMult : 1),
    radius: base.radius * (isElite ? e.radiusMult : 1),
    xp: Math.round(base.xp * (isElite ? e.xpMult : 1)),
    color: isElite ? e.color : base.color,
  };
}

/**
 * Выбор N апгрейдов без повторов, с учётом уже взятых стаков.
 * Чистая при переданном rng.
 * @param {() => number} rng
 * @param {number} count
 * @param {Record<string, number>} ownedStacks  id -> текущее число стаков
 */
export function pickUpgrades(rng, count, ownedStacks = {}) {
  const rand = rng || Math.random;
  const bag = UPGRADES.filter(
    (u) => (ownedStacks[u.id] || 0) < u.maxStacks
  );
  const picks = [];

  while (picks.length < count && bag.length > 0) {
    let total = 0;
    for (const u of bag) total += u.weight;

    let r = rand() * total;
    let idx = bag.length - 1;
    for (let i = 0; i < bag.length; i++) {
      r -= bag[i].weight;
      if (r <= 0) { idx = i; break; }
    }

    picks.push(bag[idx]);
    bag.splice(idx, 1);
  }

  return picks;
}

/**
 * Применить апгрейд к статам. Возвращает НОВЫЙ объект статов.
 * Чистая функция.
 */
export function applyUpgrade(stats, upgrade) {
  if (!upgrade || typeof upgrade.apply !== 'function') return stats;
  return upgrade.apply(stats);
}

/** Найти апгрейд по id. Чистая. */
export function getUpgradeById(id) {
  return UPGRADES.find((u) => u.id === id) || null;
}

/** Найти босса по id. Чистая. */
export function getBossById(id) {
  return BOSSES.find((b) => b.id === id) || null;
}

/** Найти архетип врага по id. Чистая. */
export function getEnemyById(id) {
  return ENEMIES[id] || null;
}