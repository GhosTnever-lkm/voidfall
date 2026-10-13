import test from 'node:test';
import assert from 'node:assert/strict';
import { calcRunReward, createDefaultProfile, recordRun } from '../src/progression.js';

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
