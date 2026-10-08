// src/game.js
import { ARENA, BASE_STATS, ENEMIES, WAVES, getWavePlan, getEnemyStats, pickUpgrades, applyUpgrade } from './content.js';
import { castAbility, createAbilityState, getTimeScale, updateAbilityState } from './abilities.js';
import { applyContractEvent, createContractState, tickContractState } from './contracts.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Game {
  constructor(canvas, callbacks = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('Game: требуется canvas-элемент');
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.callbacks = {
      onStateChange: typeof callbacks.onStateChange === 'function' ? callbacks.onStateChange : () => {},
      onGameOver:    typeof callbacks.onGameOver    === 'function' ? callbacks.onGameOver    : () => {},
      onLevelUp:     typeof callbacks.onLevelUp     === 'function' ? callbacks.onLevelUp     : () => {},
      onSound:       typeof callbacks.onSound       === 'function' ? callbacks.onSound       : () => {},
      onContractComplete: typeof callbacks.onContractComplete === 'function' ? callbacks.onContractComplete : () => {},
    };
    this.baseStats = { ...BASE_STATS, ...(callbacks.stats || {}) };

    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this._bgGrad = null;
    this._vigGrad = null;

    this.running = false;
    this.destroyed = false;
    this.paused = false;
    this.gameOver = false;
    this._attached = false;

    this.rafId = 0;
    this.lastTime = 0;
    this.stateTimer = 0;

    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };

    this.player = null;
    this.bullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.crystals = [];
    this.particles = [];
    this.stars = [];

    this.wave = 0;
    this.pendingSpawns = 0;
    this.spawnTimer = 0;
    this.waveDelay = 0;
    this.wavePlan = null;
    this.spawnQueue = [];
    this.boss = null;
    this.score = 0;
    this.elapsed = 0;
    this.kills = 0;
    this.bossKills = 0;

    this._enemyId = 1;
    this.pendingChoices = null;

    this.ownedUpgrades = {};
    this.playerStats = { ...this.baseStats };
    this.abilityState = createAbilityState();
    this.contractState = createContractState();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._loop = this._loop.bind(this);
  }

  // ---------------------------------------------------------------- public

  start() {
    if (this.destroyed || this.running) return;
    this._resize();
    this._buildStars();
    this._reset();
    this._attach();
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this._loop);
    this._emitState();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this._detach();
    this.keys.clear();
    this.mouse.down = false;
    this.pendingChoices = null;
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.enemyBullets.length = 0;
    this.crystals.length = 0;
    this.particles.length = 0;
    this.stars.length = 0;
    this.player = null;
  }

  chooseUpgrade(id) {
    if (this.destroyed || !this.pendingChoices) return false;
    const up = this.pendingChoices.find((u) => u.id === id);
    if (!up) return false;
    this.pendingChoices = null;
    this.paused = false;
    try {
      this.playerStats = applyUpgrade(this.playerStats, up);
      this.ownedUpgrades[id] = (this.ownedUpgrades[id] || 0) + 1;
      this._syncPlayerStats();
    } catch (err) {
      // ignore malformed upgrade
    }
    this._emitState();
    this._checkLevelUp();
    return true;
  }

  activateAbility(id) {
    if (!this.player || this.destroyed || this.paused || this.gameOver || this.pendingChoices) return false;
    const abilityId = ({ phaseShift: 'phase_shift', voidNova: 'void_nova', timeFold: 'time_fold' })[id] || id;
    const result = castAbility(this.abilityState, abilityId, this);
    this.abilityState = result.state;
    if (result.success) this._emitState();
    return result.success;
  }

  // ---------------------------------------------------------------- setup

  _reset() {
    const w = this.width;
    const h = this.height;
    this.playerStats = { ...this.baseStats };
    this.abilityState = createAbilityState();
    this.contractState = createContractState();
    this.player = {
      x: w * 0.5,
      y: h * 0.5,
      vx: 0,
      vy: 0,
      r: 14,
      hp: this.playerStats.maxHp,
      maxHp: this.playerStats.maxHp,
      speed: this.playerStats.moveSpeed,
      damage: this.playerStats.damage,
      fireDelay: 1 / this.playerStats.fireRate,
      fireCd: 0,
      bulletSpeed: this.playerStats.projectileSpeed,
      projectiles: this.playerStats.projectileCount,
      spread: this.playerStats.spread,
      projectileRadius: this.playerStats.projectileRadius,
      projectileLife: this.playerStats.projectileLife,
      pierce: this.playerStats.pierce,
      critChance: this.playerStats.critChance,
      critMult: this.playerStats.critMult,
      armor: this.playerStats.armor,
      regen: this.playerStats.regen,
      lifesteal: this.playerStats.lifesteal,
      magnetRadius: this.playerStats.magnetRadius,
      pickupSpeed: this.playerStats.pickupSpeed,
      xpGain: this.playerStats.xpGain,
      dashCooldown: this.playerStats.dashCooldown,
      dashCd: 0,
      dashTime: 0,
      invuln: 0,
      level: 1,
      xp: 0,
      xpToNext: 6,
      aim: 0,
    };

    this.bullets.length = 0;
    this.enemyBullets.length = 0;
    this.enemies.length = 0;
    this.crystals.length = 0;
    this.particles.length = 0;

    this.wave = 0;
    this.pendingSpawns = 0;
    this.spawnTimer = 0;
    this.waveDelay = 1.0;
    this.score = 0;
    this.elapsed = 0;
    this.kills = 0;
    this.bossKills = 0;
    this._enemyId = 1;
    this.pendingChoices = null;
    this.wavePlan = null;
    this.spawnQueue = [];
    this.boss = null;
    this.ownedUpgrades = {};
    this.paused = false;
    this.gameOver = false;

    this.mouse.x = w * 0.5 + 120;
    this.mouse.y = h * 0.5;
    this.mouse.down = false;
  }

  _attach() {
    if (this._attached) return;
    this._attached = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  _detach() {
    if (!this._attached) return;
    this._attached = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width || this.canvas.clientWidth || 1));
    const cssH = Math.max(1, Math.round(rect.height || this.canvas.clientHeight || 1));
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

    this.width = cssW;
    this.height = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);

    this._bgGrad = null;
    this._vigGrad = null;

    if (this.player) {
      this.player.x = clamp(this.player.x, this.player.r, cssW - this.player.r);
      this.player.y = clamp(this.player.y, this.player.r, cssH - this.player.r);
    }
  }

  _buildStars() {
    this.stars.length = 0;
    const count = 140;
    for (let i = 0; i < count; i++) {
      const t = Math.random();
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        s: t > 0.9 ? 2 : 1,
        a: 0.15 + Math.random() * 0.55,
        c: t > 0.85 ? '#bfe9ff' : t > 0.6 ? '#9db4ff' : '#ffffff',
        tw: 0.6 + Math.random() * 1.8,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }

  // ---------------------------------------------------------------- events

  _onKeyDown(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    if (['q', 'e', 'r'].includes(k)) {
      e.preventDefault();
      if (!e.repeat) this.activateAbility(({ q: 'phase_shift', e: 'void_nova', r: 'time_fold' })[k]);
      return;
    }
    if (k === ' ' || k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') {
      e.preventDefault();
    }
    this.keys.add(k);
  }

  _onKeyUp(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    this.keys.delete(k);
  }

  _onBlur() {
    this.keys.clear();
    this.mouse.down = false;
  }

  _onResize() {
    this._resize();
  }

  _onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
  }

  _onMouseDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this.mouse.down = true;
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  _onMouseUp(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this.mouse.down = false;
  }

  _onContextMenu(e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  // ---------------------------------------------------------------- loop

  _loop(now) {
    if (!this.running || this.destroyed) return;
    this.rafId = requestAnimationFrame(this._loop);

    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;

    if (!this.paused && !this.gameOver) {
      this._update(dt);
      this.elapsed += dt;
      this._applyContractResult(tickContractState(this.contractState, dt));
    }

    this._render();

    this.stateTimer += dt;
    if (this.stateTimer >= 0.1) {
      this.stateTimer = 0;
      this._emitState();
    }
  }

  // ---------------------------------------------------------------- update

  _update(dt) {
    const p = this.player;
    this.abilityState = updateAbilityState(this.abilityState, dt);
    const threatDt = dt * getTimeScale(this.abilityState);

    // --- ввод / движение игрока
    let mx = 0;
    let my = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    const mlen = Math.hypot(mx, my);
    if (mlen > 0) { mx /= mlen; my /= mlen; }

    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.dashTime > 0) p.dashTime -= dt;
    if (this.keys.has('shift') && p.dashCd <= 0 && mlen > 0) {
      p.dashCd = p.dashCooldown;
      p.dashTime = 0.18;
      p.invuln = Math.max(p.invuln, 0.22);
      this.callbacks.onSound('dash');
    }
    const dash = p.dashTime > 0 ? 3.2 : 1;
    p.vx = mx * p.speed * dash;
    p.vy = my * p.speed * dash;
    p.x = clamp(p.x + p.vx * dt, p.r, this.width - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, this.height - p.r);

    p.aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);

    if (p.invuln > 0) p.invuln -= dt;
    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    if (this.mouse.down) this._shoot();

    this._updateBullets(dt);
    this._updateEnemyBullets(threatDt);
    this._updateEnemies(threatDt);
    this._updateCrystals(dt);
    this._updateParticles(dt);
    this._updateWaves(dt);
  }

  _shoot() {
    const p = this.player;
    if (p.fireCd > 0) return;
    p.fireCd = p.fireDelay;
    this.callbacks.onSound('shoot');

    const ang = p.aim;
    const n = p.projectiles;
    const spread = n > 1 ? Math.max(p.spread, 0.08) : 0;

    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * spread;
      const c = Math.cos(a);
      const s = Math.sin(a);
      this.bullets.push({
        x: p.x + c * (p.r + 4),
        y: p.y + s * (p.r + 4),
        vx: c * p.bulletSpeed,
        vy: s * p.bulletSpeed,
        r: p.projectileRadius,
        damage: p.damage * (Math.random() < p.critChance ? p.critMult : 1),
        pierce: p.pierce,
        life: p.projectileLife,
        color: '#cdf7ff',
        hits: [],
      });
    }

    this._spawnParticles(
      p.x + Math.cos(ang) * (p.r + 6),
      p.y + Math.sin(ang) * (p.r + 6),
      4, '#bff6ff', { speed: 130, life: 0.22, r: 2.4, drag: 6 }
    );
  }

  _updateBullets(dt) {
    const p = this.player;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0 || b.x < -60 || b.x > this.width + 60 || b.y < -60 || b.y > this.height + 60) {
        this.bullets.splice(i, 1);
        continue;
      }

      let consumed = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        if (b.hits.indexOf(e.id) !== -1) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.r + b.r;
        if (dx * dx + dy * dy <= rr * rr) {
          e.hp -= b.damage;
          this.callbacks.onSound('hit');
          if (p.lifesteal > 0) p.hp = Math.min(p.maxHp, p.hp + b.damage * p.lifesteal);
          e.hitFlash = 1;
          b.hits.push(e.id);
          this._spawnParticles(b.x, b.y, 5, e.color, { speed: 170, life: 0.32, r: 2.6 });

          if (e.hp <= 0) this._killEnemy(j);

          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            this.bullets.splice(i, 1);
            consumed = true;
          }
          break;
        }
      }
      if (consumed) continue;
    }
    void p;
  }

  _updateEnemyBullets(dt) {
    const p = this.player;
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0 || b.x < -60 || b.x > this.width + 60 || b.y < -60 || b.y > this.height + 60) {
        this.enemyBullets.splice(i, 1);
        continue;
      }

      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const rr = b.r + p.r;
      if (dx * dx + dy * dy <= rr * rr) {
        if (p.invuln <= 0) this._damagePlayer(b.damage);
        this._spawnParticles(b.x, b.y, 6, '#ff8fa3', { speed: 150, life: 0.35, r: 2.4 });
        this.enemyBullets.splice(i, 1);
      }
    }
  }

  _updateEnemies(dt) {
    const p = this.player;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const nx = dx / dist;
      const ny = dy / dist;

      e.phase += dt * 3.2;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 4);

      if (e.isBoss) {
        this._updateBoss(e, dt, nx, ny, dist);
      } else if (e.behavior === 'chase' || e.behavior === 'split') {
        e.x += nx * e.speed * dt;
        e.y += ny * e.speed * dt;
      } else if (e.behavior === 'kite') {
        const want = e.preferredRange || 240;
        let dir = 0;
        if (dist > want + 30) dir = 1;
        else if (dist < want - 30) dir = -1;

        e.x += nx * e.speed * dt * dir;
        e.y += ny * e.speed * dt * dir;

        e.x += -ny * e.speed * 0.45 * dt * e.strafe;
        e.y += nx * e.speed * 0.45 * dt * e.strafe;

        e.fireCd -= dt;
        if (e.fireCd <= 0 && dist < 620) {
          e.fireCd = e.fireInterval;
          const sp = e.projectileSpeed || 240;
          const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * (e.aimJitter || 0);
          this.enemyBullets.push({
            x: e.x + nx * (e.r + 4),
            y: e.y + ny * (e.r + 4),
            vx: Math.cos(angle) * sp,
            vy: Math.sin(angle) * sp,
            r: e.projectileRadius || 5,
            damage: e.projectileDamage || e.damage,
            life: 3,
            color: '#ff8a5c',
          });
          this._spawnParticles(e.x + nx * e.r, e.y + ny * e.r, 4, '#e0b3ff', { speed: 110, life: 0.25, r: 2 });
        }
      } else if (e.behavior === 'charger') {
        e.chargeCd -= dt;
        let sp = e.speed;
        if (e.chargeCd <= 0 && dist < 420 && !e.charging) {
          e.chargeCd = e.chargeCooldown;
          e.telegraph = e.chargeTelegraph;
          e.chargeDir = { x: nx, y: ny };
        }
        if (e.telegraph > 0) {
          e.telegraph -= dt;
          if (e.telegraph <= 0) { e.charging = true; e.chargeTime = e.chargeDuration; }
        }
        if (e.charging) {
          e.chargeTime -= dt;
          sp = e.chargeSpeed;
          e.x += e.chargeDir.x * sp * dt;
          e.y += e.chargeDir.y * sp * dt;
          if (e.chargeTime <= 0) e.charging = false;
        } else {
          e.x += nx * sp * dt;
          e.y += ny * sp * dt;
        }
      }

      // контактный урон
      const cdx = p.x - e.x;
      const cdy = p.y - e.y;
      const crr = e.r + p.r;
      if (cdx * cdx + cdy * cdy <= crr * crr && p.invuln <= 0) {
        this._damagePlayer(e.damage);
        // отбрасываем врага, чтобы не «залипал»
        e.x -= nx * 10;
        e.y -= ny * 10;
      }
    }
  }

  _updateCrystals(dt) {
    const p = this.player;
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      c.t += dt * 3;
      c.life -= dt;

      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy) || 0.0001;

      if (d < p.magnetRadius) {
        const pullSpeed = p.pickupSpeed * (0.35 + 0.65 * (1 - d / p.magnetRadius));
        c.x += (dx / d) * pullSpeed * dt;
        c.y += (dy / d) * pullSpeed * dt;
      } else {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        const damp = Math.exp(-2.6 * dt);
        c.vx *= damp;
        c.vy *= damp;
      }

      if (d < p.r + c.r + 4) {
        this.crystals.splice(i, 1);
        this.callbacks.onSound('pickup');
        this._addXp(c.value);
        this._applyContractResult(applyContractEvent(this.contractState, { type: 'crystal_collected' }));
        this._spawnParticles(c.x, c.y, 5, '#7df9ff', { speed: 130, life: 0.35, r: 2.2 });
        continue;
      }

      if (c.life <= 0) this.crystals.splice(i, 1);
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const damp = Math.exp(-pt.drag * dt);
      pt.vx *= damp;
      pt.vy *= damp;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
  }

  _updateWaves(dt) {
    if (this.pendingSpawns > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.wavePlan?.spawnInterval || WAVES.spawnInterval;
        const batch = Math.min(this.wavePlan?.spawnBatchSize || 1, this.spawnQueue.length);
        for (let i = 0; i < batch; i++) this._spawnEnemy(this.spawnQueue.shift());
        this.pendingSpawns = this.spawnQueue.length;
      }
    } else if (this.enemies.length === 0 && !this.boss) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) this._startWave();
    }
  }

  // ---------------------------------------------------------------- waves

  _startWave() {
    this.wave += 1;
    this.wavePlan = getWavePlan(this.wave);
    this.spawnQueue = [];
    for (const entry of this.wavePlan.spawns) for (let i = 0; i < entry.count; i++) this.spawnQueue.push(entry.type);
    for (let i = this.spawnQueue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]]; }
    this.pendingSpawns = this.spawnQueue.length;
    this.spawnTimer = this.wavePlan.isBossWave ? this.wavePlan.boss.introDuration : 0.25;
    this.waveDelay = this.wavePlan.breakDuration;
    if (this.wavePlan.isBossWave) this._spawnBoss(this.wavePlan.boss);
    this._emitState();
  }

  _spawnEnemy(type = 'drone', overrides = {}) {
    const def = ENEMIES[type];
    if (!def) return null;
    const elite = !overrides.forceNormal && Math.random() < (this.wavePlan?.eliteChance || 0);
    const stats = getEnemyStats(type, this.wavePlan || getWavePlan(Math.max(1, this.wave)), elite);
    // позиция за пределами экрана
    const margin = ARENA.spawnPadding;
    let x = 0;
    let y = 0;
    const side = Math.floor(Math.random() * 4);
    if (side === 0)      { x = Math.random() * this.width;  y = -margin; }
    else if (side === 1) { x = this.width + margin;         y = Math.random() * this.height; }
    else if (side === 2) { x = Math.random() * this.width;  y = this.height + margin; }
    else                 { x = -margin;                     y = Math.random() * this.height; }

    const enemy = {
      id: this._enemyId++,
      type,
      x,
      y,
      r: stats.radius * (overrides.radiusScale || 1),
      hp: stats.hp * (overrides.hpScale || 1),
      maxHp: stats.hp * (overrides.hpScale || 1),
      speed: stats.speed * (overrides.speedScale || 1),
      damage: stats.damage,
      xp: stats.xp,
      score: stats.xp * 10,
      color: stats.color,
      behavior: def.behavior,
      elite: stats.elite,
      preferredRange: def.preferredRange,
      retreatRange: def.retreatRange,
      projectileSpeed: def.projectileSpeed,
      projectileDamage: def.projectileDamage,
      projectileRadius: def.projectileRadius,
      aimJitter: def.aimJitter,
      splitInto: def.splitInto,
      splitCount: def.splitCount,
      splitHpScale: def.splitHpScale,
      splitSpeedScale: def.splitSpeedScale,
      splitSpawnRadius: def.splitSpawnRadius,
      chargeCooldown: def.chargeCooldown || 3,
      chargeTelegraph: def.chargeTelegraph || 0.5,
      chargeSpeed: def.chargeSpeed || 300,
      chargeDuration: def.chargeDuration || 0.55,
      chargeDamage: def.chargeDamage || def.damage,
      chargeCd: 1 + Math.random() * 2,
      telegraph: 0,
      charging: false,
      chargeTime: 0,
      chargeDir: { x: 0, y: 0 },
      phase: Math.random() * Math.PI * 2,
      hitFlash: 0,
      fireCd: 0.6 + Math.random() * 0.8,
      fireInterval: 1 / (def.fireRate || 1),
      strafe: Math.random() < 0.5 ? -1 : 1,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  _spawnBoss(def) {
    const side = Math.floor(Math.random() * 4);
    const x = side === 1 ? this.width + 40 : side === 3 ? -40 : Math.random() * this.width;
    const y = side === 0 ? -40 : side === 2 ? this.height + 40 : Math.random() * this.height;
    const boss = { id: this._enemyId++, type: 'boss', isBoss: true, bossId: def.id, bossData: def, x, y, r: def.radius, hp: def.hp, maxHp: def.hp, speed: def.speed, damage: def.contactDamage, xp: def.xp, score: def.xp * 10, color: def.color, phase: 0, hitFlash: 0, attackIndex: 0, attackCd: def.introDuration, attackState: null, spiralAngle: 0, strafe: 1 };
    this.boss = boss;
    this.enemies.push(boss);
    this.callbacks.onSound('boss');
  }

  _updateBoss(e, dt, nx, ny, dist) {
    const p = this.player;
    const attacks = e.bossData.attacks;
    const attack = attacks[e.attackIndex % attacks.length];
    e.x += nx * e.speed * dt * (dist > 260 ? 1 : -0.35);
    e.y += ny * e.speed * dt * (dist > 260 ? 1 : -0.35);
    e.attackCd -= dt;
    if (e.attackState) {
      const s = e.attackState;
      if (s.pattern === 'telegraph') {
        s.time += dt;
        if (s.time >= (s.attack.telegraph || 0.45)) this._executeBossAttack(e, s.attack, s.angle);
        return;
      }
      s.time += dt;
      if (s.pattern === 'charge') {
        e.x += s.dx * (s.speed || 360) * dt;
        e.y += s.dy * (s.speed || 360) * dt;
        if (s.time >= (s.duration || 0.75)) e.attackState = null;
      } else if (s.pattern === 'sweep') {
        const angle = s.angle + (s.time / (s.duration || 1.4) - 0.5) * (s.sweepAngle || Math.PI * 0.75);
        s.currentAngle = angle;
        if (this._distanceToBeam(p.x, p.y, e.x, e.y, angle, s.beamLength || 700) < (s.beamWidth || 12) + p.r && p.invuln <= 0) this._damagePlayer(s.damage || 20);
        if (s.time >= (s.duration || 1.4)) e.attackState = null;
      } else if (s.pattern === 'shockwave') {
        s.radius += (s.expandSpeed || 260) * dt;
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (!s.hit && Math.abs(d - s.radius) < (s.thickness || 14) + p.r && p.invuln <= 0) { this._damagePlayer(s.damage || 18); s.hit = true; }
        if (s.radius > (s.endRadius || 520)) e.attackState = null;
      } else if (s.pattern === 'pull') {
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < s.pullRadius) { p.x += dx / d * s.pullStrength * dt; p.y += dy / d * s.pullStrength * dt; }
        s.tick = (s.tick || 0) + dt;
        if (s.tick > (s.tickInterval || 0.35)) { s.tick = 0; if (d < s.pullRadius && p.invuln <= 0) this._damagePlayer(s.tickDamage || 4); }
        if (s.time > (s.duration || 2)) e.attackState = null;
      } else if (s.pattern === 'spiral') {
        s.fire = (s.fire || 0) - dt;
        if (s.fire <= 0 && s.shotsLeft > 0) {
          s.fire = s.shotInterval || 0.09;
          for (let arm = 0; arm < (s.arms || 3); arm++) {
            const a = e.spiralAngle + arm * Math.PI * 2 / (s.arms || 3);
            this.enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * (s.projectileSpeed || 200), vy: Math.sin(a) * (s.projectileSpeed || 200), r: s.projectileRadius || 5, damage: s.projectileDamage || 9, life: 4, color: e.color });
          }
          e.spiralAngle += s.angleStep || 0.5;
          s.shotsLeft--;
        }
        if (s.shotsLeft <= 0) e.attackState = null;
      }
      return;
    }
    if (e.attackCd > 0) return;
    e.attackIndex = (e.attackIndex + 1) % attacks.length;
    e.attackCd = attack.cooldown;
    const aim = Math.atan2(p.y - e.y, p.x - e.x);
    e.attackState = { pattern:'telegraph', attack, time:0, angle:aim };
  }

  _executeBossAttack(e, attack, aim) {
    const p = this.player;
    e.attackState = null;
    if (attack.pattern === 'ring') {
      for (let i = 0; i < attack.projectileCount; i++) { const a = Math.PI * 2 * i / attack.projectileCount; this.enemyBullets.push({ x:e.x, y:e.y, vx:Math.cos(a)*attack.projectileSpeed, vy:Math.sin(a)*attack.projectileSpeed, r:attack.projectileRadius, damage:attack.projectileDamage, life:attack.projectileLife, color:e.color }); }
    } else if (attack.pattern === 'summon') {
      for (let i = 0; i < attack.summonCount; i++) { const a = Math.PI * 2 * i / attack.summonCount; const minion = this._spawnEnemy(attack.summonType, { forceNormal: true, hpScale: 0.75 }); if (minion) { minion.x = clamp(e.x + Math.cos(a)*attack.summonSpread, 10, this.width-10); minion.y = clamp(e.y + Math.sin(a)*attack.summonSpread, 10, this.height-10); } }
    } else if (attack.pattern === 'charge') e.attackState = { ...attack, dx:Math.cos(aim), dy:Math.sin(aim), time:0 };
    else if (attack.pattern === 'sweep') e.attackState = { ...attack, angle:aim, time:0 };
    else if (attack.pattern === 'teleport') {
      const a = aim + Math.PI + (Math.random()-0.5)*1.1, d = attack.minDistance + Math.random()*(attack.maxDistance-attack.minDistance);
      e.x = clamp(p.x + Math.cos(a)*d, e.r, this.width-e.r); e.y = clamp(p.y + Math.sin(a)*d, e.r, this.height-e.r);
      for (let i = 0; i < attack.burstOnArrive; i++) { const b = Math.PI*2*i/attack.burstOnArrive; this.enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(b)*attack.burstSpeed,vy:Math.sin(b)*attack.burstSpeed,r:5,damage:attack.burstDamage,life:3,color:e.color}); }
    } else if (attack.pattern === 'spiral') e.attackState = { ...attack, time:0, shotsLeft:attack.shots, fire:0 };
    else if (attack.pattern === 'shockwave') e.attackState = { ...attack, time:0, radius:attack.startRadius, hit:false };
    else if (attack.pattern === 'pull') e.attackState = { ...attack, time:0, tick:0 };
  }

  _distanceToBeam(px, py, x, y, angle, length) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const t = clamp((px-x)*dx + (py-y)*dy, 0, length);
    return Math.hypot(px-(x+dx*t), py-(y+dy*t));
  }

  _killEnemy(index) {
    const e = this.enemies[index];
    if (!e) return;
    this.enemies.splice(index, 1);
    if (e.isBoss) { this.boss = null; this.bossKills += 1; }
    if (e.splitInto && e.splitCount) {
      for (let n = 0; n < e.splitCount; n++) {
        const child = this._spawnEnemy(e.splitInto, { forceNormal:true, hpScale:e.splitHpScale, speedScale:e.splitSpeedScale });
        if (child) { const a = Math.PI * 2 * n / e.splitCount; child.x = clamp(e.x + Math.cos(a)*e.splitSpawnRadius, 10, this.width-10); child.y = clamp(e.y + Math.sin(a)*e.splitSpawnRadius, 10, this.height-10); }
      }
    }
    this.kills += 1;
    this.score += e.score;
    this._applyContractResult(applyContractEvent(this.contractState, { type: 'enemy_killed' }));

    this._spawnParticles(e.x, e.y, 14, e.color, { speed: 220, life: 0.55, r: 3.2 });
    this.callbacks.onSound('kill');
    this._spawnParticles(e.x, e.y, 6, '#ffffff', { speed: 160, life: 0.35, r: 2 });

    const drops = Math.max(1, Math.round(e.xp));
    for (let i = 0; i < drops; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 90;
      this.crystals.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 5,
        value: e.xp / drops,
        life: 18,
        t: Math.random() * Math.PI * 2,
      });
    }

    this._emitState();
  }

  // ---------------------------------------------------------------- damage / xp

  _damagePlayer(amount) {
    const p = this.player;
    if (!p || this.gameOver || p.invuln > 0) return;

    p.hp -= Math.max(1, amount - p.armor);
    p.invuln = this.playerStats.invulnAfterHit;
    this.callbacks.onSound('hit');

    this._spawnParticles(p.x, p.y, 12, '#ff5c7a', { speed: 210, life: 0.5, r: 3 });

    if (p.hp <= 0) {
      p.hp = 0;
      this._triggerGameOver();
    }
    this._emitState();
  }

  _addXp(amount) {
    const p = this.player;
    if (!p) return;
    p.xp += amount * p.xpGain;
    this.score += 2;
    this._checkLevelUp();
  }

  _applyContractResult(result) {
    if (!result || !result.state) return;
    this.contractState = result.state;
    for (const contract of result.completed || []) {
      this._addXp(contract.rewardXp);
      this.callbacks.onContractComplete({ title: contract.title, rewardXp: contract.rewardXp });
    }
  }

  _checkLevelUp() {
    const p = this.player;
    if (!p || this.pendingChoices || this.gameOver) return;

    if (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level += 1;
      p.xpToNext = Math.floor(p.xpToNext * 1.32 + 4);
      this._triggerLevelUp();
    }
  }

  _triggerLevelUp() {
    this.paused = true;
    this.callbacks.onSound('levelup');

    const choices = pickUpgrades(Math.random, 3, this.ownedUpgrades);
    this.pendingChoices = choices;

    const payload = choices.map((u) => ({ id: u.id, name: u.name, desc: u.desc }));
    const choose = (id) => this.chooseUpgrade(id);

    this._emitState();
    this.callbacks.onLevelUp(payload, choose);
  }

  _triggerGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.mouse.down = false;
    this.pendingChoices = null;

    this._spawnParticles(this.player.x, this.player.y, 40, '#8fe6ff', { speed: 320, life: 0.9, r: 3.6 });

    this.callbacks.onGameOver({
      score: Math.round(this.score),
      wave: this.wave,
      level: this.player.level,
      kills: this.kills,
      bosses: this.bossKills,
      time: this.elapsed,
    });
    this._emitState();
  }

  _emitState() {
    const p = this.player;
    if (!p) return;
    this.callbacks.onStateChange({
      hp: Math.max(0, Math.round(p.hp)),
      maxHp: Math.round(p.maxHp),
      level: p.level,
      xp: Math.round(p.xp),
      xpToNext: Math.round(p.xpToNext),
      wave: this.wave,
      score: Math.round(this.score),
      time: this.elapsed,
      kills: this.kills,
      paused: this.paused,
      gameOver: this.gameOver,
      enemies: this.enemies.length,
      damage: Math.round(p.damage),
      fireRate: Number((1 / p.fireDelay).toFixed(1)),
      speedMultiplier: Number((p.speed / this.baseStats.moveSpeed).toFixed(2)),
      boss: this.boss ? { name: this.boss.bossData.name, hp: Math.max(0, Math.round(this.boss.hp)), maxHp: this.boss.maxHp } : null,
      abilities: this.abilityState.cooldowns,
      timeFold: this.abilityState.timeFold,
      contracts: this.contractState.contracts,
    });
  }

  getState() {
    const p = this.player;
    return p ? { hp:p.hp, maxHp:p.maxHp, level:p.level, xp:p.xp, xpToNext:p.xpToNext, wave:this.wave, score:this.score, time:this.elapsed, kills:this.kills, bosses:this.bossKills, paused:this.paused, gameOver:this.gameOver, enemies:this.enemies.length, damage:p.damage, fireRate:1/p.fireDelay, speedMultiplier:p.speed/this.baseStats.moveSpeed, abilities:this.abilityState.cooldowns, timeFold:this.abilityState.timeFold, contracts:this.contractState.contracts } : {};
  }

  _syncPlayerStats() {
    const p = this.player, s = this.playerStats;
    if (!p) return;
    const oldMax = p.maxHp;
    p.maxHp=s.maxHp; p.hp=Math.min(s.maxHp, p.hp + Math.max(0,s.maxHp-oldMax));
    p.speed=s.moveSpeed; p.damage=s.damage; p.fireDelay=1/s.fireRate; p.bulletSpeed=s.projectileSpeed;
    p.projectiles=s.projectileCount; p.spread=s.spread; p.projectileRadius=s.projectileRadius; p.projectileLife=s.projectileLife;
    p.pierce=s.pierce; p.critChance=s.critChance; p.critMult=s.critMult; p.armor=s.armor; p.regen=s.regen;
    p.lifesteal=s.lifesteal; p.magnetRadius=s.magnetRadius; p.pickupSpeed=s.pickupSpeed; p.xpGain=s.xpGain; p.dashCooldown=s.dashCooldown;
  }

  // ---------------------------------------------------------------- particles

  _spawnParticles(x, y, count, color, opts = {}) {
    if (this.particles.length > 900) return;
    const speed = opts.speed || 150;
    const life = opts.life || 0.45;
    const r = opts.r || 3;
    const drag = opts.drag !== undefined ? opts.drag : 3;

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.95);
      const l = life * (0.6 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: l,
        maxLife: l,
        r: r * (0.55 + Math.random() * 0.9),
        color,
        drag,
      });
    }
  }

  // ---------------------------------------------------------------- render

  _render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this._drawBackground(ctx);

    for (const e of this.enemies) if (e.isBoss && e.attackState?.pattern === 'sweep') {
      const a = e.attackState.currentAngle ?? e.attackState.angle;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(a); ctx.fillStyle = 'rgba(255,70,110,0.22)'; ctx.fillRect(0, -6, e.attackState.beamLength || 700, 12); ctx.restore();
    }
    for (const e of this.enemies) if (e.isBoss && e.attackState?.pattern === 'telegraph') {
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r+12+Math.sin(this.elapsed*12)*4,0,Math.PI*2); ctx.strokeStyle='rgba(255,224,102,0.85)'; ctx.lineWidth=3; ctx.stroke();
    }
    for (const e of this.enemies) if (e.isBoss && e.attackState?.pattern === 'shockwave') {
      ctx.beginPath(); ctx.arc(e.x, e.y, e.attackState.radius, 0, Math.PI*2); ctx.strokeStyle = 'rgba(199,107,255,0.75)'; ctx.lineWidth = e.attackState.thickness || 14; ctx.stroke();
    }

    // кристаллы
    for (let i = 0; i < this.crystals.length; i++) {
      const c = this.crystals[i];
      const a = Math.min(1, c.life / 1.5);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.globalAlpha = a;

      ctx.beginPath();
      ctx.arc(0, 0, c.r * 2.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(125,249,255,0.14)';
      ctx.fill();

      ctx.rotate(c.t);
      ctx.beginPath();
      ctx.moveTo(0, -c.r);
      ctx.lineTo(c.r * 0.85, 0);
      ctx.lineTo(0, c.r);
      ctx.lineTo(-c.r * 0.85, 0);
      ctx.closePath();
      ctx.fillStyle = '#7df9ff';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      ctx.restore();
    }

    // пули врагов
    for (let i = 0; i < this.enemyBullets.length; i++) {
      const b = this.enemyBullets[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,110,150,0.16)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ff8fa3';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.stroke();
    }

    // враги
    for (let i = 0; i < this.enemies.length; i++) {
      this._drawEnemy(ctx, this.enemies[i]);
    }

    // пули игрока
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,220,255,0.18)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = '#cdf7ff';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
    }

    // игрок
    if (this.player && !this.gameOver) this._drawPlayer(ctx);

    // частицы
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      const t = pt.life / pt.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, t));
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r * (0.4 + t * 0.6), 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawBackground(ctx) {
    if (!this._bgGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, this.height || 1);
      g.addColorStop(0, '#060913');
      g.addColorStop(1, '#0e0a1e');
      this._bgGrad = g;
    }
    ctx.fillStyle = this._bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      const a = s.a * (0.55 + 0.45 * Math.sin(this.elapsed * s.tw + s.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x * this.width, s.y * this.height, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    if (!this._vigGrad) {
      const cx = this.width / 2;
      const cy = this.height / 2;
      const inner = Math.min(this.width, this.height) * 0.22;
      const outer = Math.max(this.width, this.height) * 0.78;
      const v = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.6)');
      this._vigGrad = v;
    }
    ctx.fillStyle = this._vigGrad;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  _drawPlayer(ctx) {
    const p = this.player;
    const blink = p.invuln > 0 && Math.floor(p.invuln * 22) % 2 === 0;

    ctx.save();
    ctx.globalAlpha = blink ? 0.35 : 1;

    const grd = ctx.createRadialGradient(p.x, p.y, p.r * 0.3, p.x, p.y, p.r * 2.8);
    grd.addColorStop(0, 'rgba(90,200,255,0.5)');
    grd.addColorStop(1, 'rgba(90,200,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 2.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = '#8fe6ff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const ang = p.aim;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(p.x + c * (p.r + 1), p.y + s * (p.r + 1));
    ctx.lineTo(p.x + c * (p.r + 12), p.y + s * (p.r + 12));
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();

    ctx.restore();
  }

  _drawEnemy(ctx, e) {
    const flash = e.hitFlash > 0.02;
    const stroke = flash ? '#ffffff' : 'rgba(255,255,255,0.55)';

    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.isBoss) {
      ctx.beginPath(); ctx.arc(0,0,e.r*1.35,0,Math.PI*2); ctx.fillStyle=`${e.color}30`; ctx.fill();
      ctx.save(); ctx.rotate(e.phase * 0.5); ctx.beginPath();
      for(let i=0;i<12;i++){const a=i*Math.PI/6,r=i%2?e.r*0.72:e.r*1.1; if(i===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
      ctx.closePath(); ctx.fillStyle=flash?'#fff':e.color; ctx.fill(); ctx.lineWidth=3; ctx.strokeStyle=stroke; ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(0,0,e.r*0.38,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
    } else if (e.type === 'drone' || e.type === 'grunt') {
      ctx.save();
      ctx.rotate(e.phase * 0.7);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a1 = (i / 3) * Math.PI * 2;
        const a2 = a1 + Math.PI / 3;
        ctx.lineTo(Math.cos(a1) * e.r * 1.45, Math.sin(a1) * e.r * 1.45);
        ctx.lineTo(Math.cos(a2) * e.r * 0.68, Math.sin(a2) * e.r * 0.68);
      }
      ctx.closePath();
      ctx.fillStyle = flash ? '#ffffff' : e.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = flash ? '#ffffff' : '#2b0d0d';
      ctx.fill();
    } else if (e.type === 'shooter') {
      ctx.save();
      ctx.rotate(e.phase * 0.35);
      ctx.beginPath();
      ctx.moveTo(0, -e.r);
      ctx.lineTo(e.r, 0);
      ctx.lineTo(0, e.r);
      ctx.lineTo(-e.r, 0);
      ctx.closePath();
      ctx.fillStyle = flash ? '#ffffff' : e.color;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = flash ? '#ffffff' : '#2a0b3d';
      ctx.fill();
    } else if (e.type === 'tank' || e.type === 'brute') {
      ctx.save();
      ctx.rotate(e.phase * 0.22);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * e.r;
        const py = Math.sin(a) * e.r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = flash ? '#ffffff' : e.color;
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.44, 0, Math.PI * 2);
      ctx.fillStyle = flash ? '#ffffff' : '#3a1a00';
      ctx.fill();
    } else {
      ctx.save(); ctx.rotate(e.phase * 0.35); ctx.beginPath(); ctx.arc(0,0,e.r,0,Math.PI*2); ctx.fillStyle=flash?'#fff':e.color; ctx.fill(); ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.stroke();
      for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(Math.cos(i*2.094)*e.r*0.5,Math.sin(i*2.094)*e.r*0.5,e.r*0.22,0,Math.PI*2);ctx.fillStyle='#230e21';ctx.fill();} ctx.restore();
    }

    ctx.restore();

    // полоска HP
    if (e.hp < e.maxHp) {
      const w = e.isBoss ? 140 : e.r * 2.4;
      const h = e.isBoss ? 6 : 3;
      const x = e.x - w / 2;
      const y = e.y - e.r - (e.isBoss ? 16 : 10);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = e.color;
      ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), h);
    }
  }
}
