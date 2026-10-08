import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyContractEvent,
  createContractState,
  sanitizeContractState,
  tickContractState,
} from '../src/contracts.js';

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function byType(state, type) {
  return state.contracts.find((contract) => contract.type === type);
}

function stateWith(overrides = {}) {
  const state = createContractState(seeded(7), 1);
  return {
    ...state,
    contracts: state.contracts.map((contract) => ({
      ...contract,
      ...(overrides[contract.type] || {}),
    })),
  };
}

test('creates stable, wave-scaled contracts with bounded goals', () => {
  const first = createContractState(seeded(42), 3);
  const second = createContractState(seeded(42), 3);

  assert.deepEqual(first, second);
  assert.deepEqual(first.contracts.map((contract) => contract.type).sort(), [
    'crystal_collected', 'enemy_killed', 'survive',
  ]);
  assert.ok(first.contracts.every((contract) => contract.progress === 0));

  const late = createContractState(seeded(42), 1000);
  assert.ok(late.contracts.every((contract) => contract.goal <= (contract.type === 'survive' ? 90 : 30)));
  assert.ok(late.contracts.every((contract) => contract.rewardXp <= 150));
});

test('kill events progress only the kill contract by one, including bosses', () => {
  const original = stateWith({
    enemy_killed: { goal: 2 },
    crystal_collected: { goal: 8 },
    survive: { goal: 40 },
  });
  const result = applyContractEvent(original, { type: 'enemy_killed', isBoss: true });

  assert.equal(byType(result.state, 'enemy_killed').progress, 1);
  assert.equal(byType(result.state, 'crystal_collected').progress, 0);
  assert.equal(byType(result.state, 'survive').progress, 0);
  assert.equal(result.completed.length, 0);
  assert.equal(byType(original, 'enemy_killed').progress, 0);
});

test('crystal collection counts pickups, not their XP value', () => {
  const original = stateWith({ crystal_collected: { goal: 3 } });
  const result = applyContractEvent(original, { type: 'crystal_collected', value: 999 });

  assert.equal(byType(result.state, 'crystal_collected').progress, 1);
  assert.equal(byType(original, 'crystal_collected').progress, 0);
});

test('contract completion is returned once and progress remains capped', () => {
  const original = stateWith({ enemy_killed: { goal: 1 } });
  const first = applyContractEvent(original, { type: 'enemy_killed' });
  const repeat = applyContractEvent(first.state, { type: 'enemy_killed' });

  assert.equal(first.completed.length, 1);
  assert.equal(first.completed[0].rewardXp, byType(first.state, 'enemy_killed').rewardXp);
  assert.equal(byType(first.state, 'enemy_killed').progress, 1);
  assert.equal(byType(repeat.state, 'enemy_killed').progress, 1);
  assert.equal(repeat.completed.length, 0);
  assert.equal(repeat.state.completedCount, 1);
});

test('survival tick clamps elapsed time and completes exactly once', () => {
  const original = stateWith({ survive: { goal: 1 } });
  const noTime = tickContractState(original, 0);
  const invalid = tickContractState(original, Number.NaN);
  const clampedFrame = tickContractState(original, 1);
  let completed = clampedFrame;
  for (let i = 0; i < 3; i++) completed = tickContractState(completed.state, 0.25);
  const afterComplete = tickContractState(completed.state, 0.1);

  assert.equal(byType(noTime.state, 'survive').progress, 0);
  assert.equal(byType(invalid.state, 'survive').progress, 0);
  assert.equal(byType(clampedFrame.state, 'survive').progress, 0.25);
  assert.equal(byType(completed.state, 'survive').progress, 1);
  assert.equal(completed.completed.length, 1);
  assert.equal(afterComplete.completed.length, 0);
});

test('frozen input state is not mutated by event or time updates', () => {
  const state = stateWith();
  Object.freeze(state.contracts.forEach(Object.freeze));
  Object.freeze(state.contracts);
  Object.freeze(state);

  assert.doesNotThrow(() => applyContractEvent(state, { type: 'enemy_killed' }));
  assert.doesNotThrow(() => tickContractState(state, 0.05));
  assert.equal(byType(state, 'enemy_killed').progress, 0);
  assert.equal(byType(state, 'survive').progress, 0);
});

test('sanitizing malformed state is bounded and idempotent', () => {
  const raw = {
    wave: 999,
    completedCount: 999,
    totalRewardXp: -1,
    contracts: [
      { type: 'enemy_killed', goal: 2, progress: 50, rewardXp: 99999 },
      { type: 'enemy_killed', goal: 1, progress: 0, rewardXp: 10 },
      { type: 'unknown', goal: 1, progress: 0, rewardXp: 1 },
    ],
  };
  const sanitized = sanitizeContractState(raw);
  const again = sanitizeContractState(sanitized);

  assert.equal(sanitized.wave, 20);
  assert.equal(sanitized.contracts.length, 3);
  assert.equal(byType(sanitized, 'enemy_killed').progress, 2);
  assert.equal(byType(sanitized, 'enemy_killed').rewarded, true);
  assert.equal(sanitized.completedCount, 1);
  assert.equal(sanitized.totalRewardXp, sanitized.contracts.reduce((sum, contract) => sum + contract.rewardXp, 0));
  assert.deepEqual(again, sanitized);
});

test('sanitizer rebuilds missing contracts without changing valid reward data', () => {
  const partial = {
    wave: 2,
    contracts: [{ type: 'crystal_collected', goal: 9, progress: 4, rewardXp: 37 }],
  };
  const repaired = sanitizeContractState(partial);

  assert.equal(byType(repaired, 'crystal_collected').progress, 4);
  assert.equal(byType(repaired, 'crystal_collected').rewardXp, 37);
  for (const type of ['enemy_killed', 'survive']) {
    assert.equal(byType(repaired, type).progress, 0);
    assert.equal(byType(repaired, type).rewarded, false);
  }
});
