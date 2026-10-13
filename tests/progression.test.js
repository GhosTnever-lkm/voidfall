import test from 'node:test';
import assert from 'node:assert/strict';
import { calcRunReward, canSaveProfile, createDefaultProfile, recordRun, saveProfile, STORAGE_KEY } from '../src/progression.js';

test('rewards only waves explicitly marked completed', () => {
  assert.equal(calcRunReward({ wave: 1, completedWaves: 0, kills: 0 }), 0);
  assert.equal(calcRunReward({ wave: 2, completedWaves: 1, kills: 0 }), 3);
});

test('a death during the first wave does not grant a wave record or reward', () => {
  const profile = recordRun(createDefaultProfile(), {
    wave: 1,
    completedWaves: 0,
    kills: 0,
    score: 0,
  });

  assert.equal(profile.bestWave, 0);
  assert.equal(profile.essence, 0);
  assert.equal(profile.totalRuns, 1);
});

test('legacy callers without completedWaves retain their previous wave behavior', () => {
  const profile = recordRun(createDefaultProfile(), { wave: 2, kills: 0 });
  assert.equal(profile.bestWave, 2);
  assert.equal(profile.essence, 6);
});

test('saveProfile reports unavailable storage instead of claiming persistence', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { setItem() { throw new Error('storage quota exceeded'); } },
  });

  try {
    assert.equal(canSaveProfile(), false);
    assert.equal(saveProfile(createDefaultProfile()), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('canSaveProfile checks storage without rewriting the career profile', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const profileValue = '{"version":1,"essence":12}';
  const values = new Map([[STORAGE_KEY, profileValue]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
  });

  try {
    assert.equal(canSaveProfile(), true);
    assert.equal(values.get(STORAGE_KEY), profileValue);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
