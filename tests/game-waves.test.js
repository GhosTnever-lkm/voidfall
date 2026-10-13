import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

function makeGame() {
  return new Game({ getContext: () => ({}) });
}

test('does not complete a wave while enemies remain', () => {
  const game = makeGame();
  game.wave = 1;
  game.waveDelay = 5;
  game.enemies = [{}];

  game._updateWaves(0.1);

  assert.equal(game.completedWaves, 0);
});

test('does not complete a wave while spawns are pending', () => {
  const game = makeGame();
  game.wave = 1;
  game.waveDelay = 5;
  game.pendingSpawns = 1;
  game.spawnTimer = 10;
  game.spawnQueue = ['grunt'];
  game.wavePlan = { spawnInterval: 1, spawnBatchSize: 1 };

  game._updateWaves(0.1);

  assert.equal(game.completedWaves, 0);
});

test('marks a wave complete after its enemies and boss are gone', () => {
  const game = makeGame();
  game.wave = 1;
  game.waveDelay = 5;
  game.enemies = [];
  game.boss = null;

  game._updateWaves(0.1);

  assert.equal(game.completedWaves, 1);
});
