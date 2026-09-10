import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/js/game.js', import.meta.url), 'utf8');
const windowStub = { addEventListener() {}, setTimeout(callback) { callback(); } };
const context = {
  window: windowStub,
  document: { addEventListener() {} },
  app: { showToast() {} },
  localStorage: { getItem() { return null; }, setItem() {} },
  setTimeout() {},
  console
};
vm.runInNewContext(source, context);
const game = windowStub.game;

assert.equal(game.rewardTargetMultiplier, 10);
assert.equal(game.boostTriggerLines, 3);
game.multiplier = 1;
const progression = [];
for (let index = 0; index < 18; index++) progression.push(game.advanceDemoMultiplier());
assert.deepEqual(progression, [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
assert.equal(game.advanceDemoMultiplier(), 10);

game.multiplier = 3.14;
assert.equal(game.advanceDemoMultiplier(), 3.5);
game.multiplier = 1;
assert.equal(game.advanceDemoMultiplier(0), 1);
assert.equal(game.advanceDemoMultiplier(2), 2);

game.playLineCompleteSound = () => {};
game.triggerLineCelebration = () => {};
game.gridSize = 8;
game.multiplierProfile = 'standard';
game.difficulty = 'impossible';
game.mode = 'real';
game.combo = 0;
game.linesCleared = 0;
game.score = 0;
game.rewardTargetMultiplier = 10;
game.board = Array.from({ length: 8 }, (_, row) => Array(8).fill(row === 0 ? '#fff' : null));
game.multiplier = 1;
game.boostActive = false;
game.checkLines(8);
assert.equal(game.multiplier, 1.06, 'A progressão normal deve continuar na velocidade original');

game.board = Array.from({ length: 8 }, (_, row) => Array(8).fill(row === 0 ? '#fff' : null));
game.multiplier = 10;
game.combo = 0;
game.boostActive = true;
game.boostRate = 3;
game.boostMaxMultiplier = 30;
game.checkLines(8);
assert.equal(game.multiplier, 10.18, 'O boost deve triplicar apenas o aumento futuro de 0,06x para 0,18x');

let boostOfferCalls = 0;
game.showBoostOffer = () => { boostOfferCalls++; };
game.board = Array.from({ length: 8 }, (_, row) => Array(8).fill(row === 0 ? '#fff' : null));
game.multiplier = 1;
game.linesCleared = 2;
game.combo = 0;
game.boostActive = false;
game.boostOfferShown = false;
game.checkLines(8);
assert.equal(game.linesCleared, 3);
assert.equal(boostOfferCalls, 1, 'O upsell deve abrir ao concluir a terceira linha');
console.log('Demo multiplier progression validated.');
