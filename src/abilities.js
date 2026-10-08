// Active abilities for VOIDFALL. State is immutable; game effects are applied on cast.
export const ABILITIES = Object.freeze({
  phase_shift: Object.freeze({ id: 'phase_shift', key: 'q', label: 'Фазовый сдвиг', description: 'Рывок на 220 пикселей и краткая неуязвимость', cooldown: 9 }),
  void_nova: Object.freeze({ id: 'void_nova', key: 'e', label: 'Всплеск Бездны', description: 'Взрыв в радиусе 150 пикселей с отбрасыванием', cooldown: 11 }),
  time_fold: Object.freeze({ id: 'time_fold', key: 'r', label: 'Складка времени', description: 'Замедляет врагов и снаряды на 65% на 3,5 секунды', cooldown: 18 }),
});

const ids = Object.keys(ABILITIES);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createAbilityState() {
  return Object.freeze({ cooldowns: Object.freeze({ phase_shift: 0, void_nova: 0, time_fold: 0 }), timeFold: Object.freeze({ active: false, remaining: 0, scale: 1 }) });
}

function sanitize(state) {
  const cooldowns = Object.fromEntries(ids.map((id) => [id, Math.max(0, finite(state?.cooldowns?.[id]))]));
  const fold = state?.timeFold || {};
  const remaining = Math.max(0, finite(fold.remaining));
  return Object.freeze({ cooldowns: Object.freeze(cooldowns), timeFold: Object.freeze({ active: !!fold.active && remaining > 0, remaining, scale: clamp(finite(fold.scale, 0.35), 0.01, 1) }) });
}

export function getTimeScale(state) {
  const s = sanitize(state);
  return s.timeFold.active ? s.timeFold.scale : 1;
}

export function updateAbilityState(state, dt) {
  const s = sanitize(state);
  const step = clamp(finite(dt), 0, 0.25);
  if (!step) return s;
  const cooldowns = Object.fromEntries(ids.map((id) => [id, Math.max(0, s.cooldowns[id] - step)]));
  const remaining = Math.max(0, s.timeFold.remaining - step);
  const timeFold = remaining > 0 && s.timeFold.active
    ? Object.freeze({ ...s.timeFold, remaining })
    : Object.freeze({ active: false, remaining: 0, scale: 1 });
  return Object.freeze({ cooldowns: Object.freeze(cooldowns), timeFold });
}

export function castAbility(state, id, game) {
  const s = sanitize(state);
  if (!ABILITIES[id] || !game?.player || s.cooldowns[id] > 0 || finite(game.player.hp, 1) <= 0) return { state: s, success: false };
  const p = game.player;
  if (id === 'phase_shift') {
    const angle = finite(p.aim);
    const startX = p.x, startY = p.y;
    const r = finite(p.r, 0), distance = 220;
    p.x = clamp(finite(p.x) + Math.cos(angle) * distance, r, Math.max(r, finite(game.width, p.x + distance) - r));
    p.y = clamp(finite(p.y) + Math.sin(angle) * distance, r, Math.max(r, finite(game.height, p.y + distance) - r));
    p.invuln = Math.max(finite(p.invuln), 0.4);
    for (let i = 1; i <= 4; i++) game._spawnParticles?.(startX + (p.x - startX) * i / 4, startY + (p.y - startY) * i / 4, 5, '#8be9fd', { speed: 65, life: 0.35 });
  } else if (id === 'void_nova') {
    const cx = p.x, cy = p.y, radius = 150, damage = Math.max(1, finite(p.damage, 10)) * 3.5;
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];
      const dx = e.x - cx, dy = e.y - cy, distance = Math.hypot(dx, dy);
      if (distance > radius + finite(e.r)) continue;
      e.hp -= damage;
      const nx = distance > 0.001 ? dx / distance : 1, ny = distance > 0.001 ? dy / distance : 0;
      const push = e.isBoss ? 30 : 120;
      e.x = clamp(e.x + nx * push, finite(e.r), game.width - finite(e.r));
      e.y = clamp(e.y + ny * push, finite(e.r), game.height - finite(e.r));
      game._spawnParticles?.(e.x, e.y, 8, '#bd93f9', { speed: 120 });
      if (e.hp <= 0) game._killEnemy?.(i);
    }
    game._spawnParticles?.(cx, cy, 32, '#bd93f9', { speed: 220, life: 0.55 });
  } else {
    game._spawnParticles?.(p.x, p.y, 32, '#50fa7b', { speed: 180, life: 0.8 });
  }
  game.callbacks?.onSound?.(id);
  const cooldowns = Object.freeze({ ...s.cooldowns, [id]: ABILITIES[id].cooldown });
  const timeFold = id === 'time_fold'
    ? Object.freeze({ active: true, remaining: 3.5, scale: 0.35 })
    : s.timeFold;
  return { state: Object.freeze({ cooldowns, timeFold }), success: true };
}
