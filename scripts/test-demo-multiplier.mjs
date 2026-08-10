import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/js/game.js', import.meta.url), 'utf8');
const windowStub = { addEventListener() {} };
const context = {
  window: windowStub,
  document: { addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() {},
  console
};
vm.runInNewContext(source, context);
const game = windowStub.game;

game.multiplier = 1;
const progression = [];
for (let index = 0; index < 18; index++) progression.push(game.advanceDemoMultiplier());
assert.deepEqual(progression, [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
assert.equal(game.advanceDemoMultiplier(), 10);

game.multiplier = 3.14;
assert.equal(game.advanceDemoMultiplier(), 3.5);
console.log('Demo multiplier progression validated.');
