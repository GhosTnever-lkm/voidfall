import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { APP_VERSION } from '../src/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');

test('package, README, changelog, and HUD use the shared app version', () => {
  const pkg = JSON.parse(read('package.json'));
  const readme = read('README.md');
  const changelog = read('CHANGELOG.md');
  const html = read('index.html');
  const main = read('src/main.js');

  assert.equal(pkg.version, APP_VERSION);
  assert.match(readme, new RegExp(`version ${APP_VERSION}\\.`));
  assert.match(changelog, new RegExp(`^## ${APP_VERSION.replaceAll('.', '\\.')} —`, 'm'));
  assert.match(html, /id="app-version"/);
  assert.match(main, /import \{ APP_VERSION \} from "\.\/version\.js"/);
});

test('offline precache contains the HUD version module', () => {
  const serviceWorker = read('sw.js');
  assert.match(serviceWorker, /"\.\/src\/version\.js"/);
  assert.match(serviceWorker, new RegExp(`const CACHE = "voidfall-shell-v${APP_VERSION.replaceAll('.', '\\.')}";`));
});
