import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeckProfile, getDeckFilterOptions, matchDeckProfile, EMPTY_DECK_FILTERS, profileFromSavedCards } from './savedDeckFilters.js';
import { sortSavedDecks } from './savedDeckSort.js';
import cardData from '../cardData.js';
import { PACK_OPTIONS } from './deckPacks.js';

test('実カードの全表裏で収録パックがカード番号と一致し、地霊殿が誤った候補に分かれない', () => {
  const packs = new Map(PACK_OPTIONS.map(pack => [pack.split(' ')[0], pack]));
  for (const card of cardData) {
    for (const face of card.isDoubleSided ? [card.front, card.back] : [card]) {
      assert.equal(face.pack, packs.get(face.cardNumber.split('-')[0]), face.cardNumber);
    }
  }
  const okuu = cardData.find(card => card.back?.cardNumber === 'BSTH06-転醒X01(B)');
  const profile = profileFromSavedCards([{ ...okuu, count: 3 }]);
  assert.deepEqual(getDeckFilterOptions([profile]).pack, [{ value: 'BSTH06 東方地霊殿', count: 1 }]);
});

const red = { colors: ['赤'], tribe: '幻想・博麗', pack: 'BSTH01 東方紅魔郷' };
const blue = { colors: ['青'], tribe: '星霊魔導士／FT', pack: 'BSFT01 フェアリーテイル', contract: 'ルーシィ' };
const match = (profile, filters) => matchDeckProfile(profile, { ...EMPTY_DECK_FILTERS, ...filters });

test('候補件数はデッキ単位。0枚・無効枚数を除外し、系統を分割する', () => {
  const first = createDeckProfile([{ count: 30, faces: [red] }, { count: 10, faces: [blue] }, { count: 0, faces: [{ colors: ['緑'] }] }]);
  const second = createDeckProfile([{ count: 3, faces: [red] }, { count: NaN, faces: [blue] }, { count: -1, faces: [blue] }]);
  const options = getDeckFilterOptions([first, second]);
  assert.deepEqual(options.color, [{ value: '赤', count: 2 }, { value: '青', count: 1 }]);
  assert.equal(options.tribe.find(option => option.value === 'FT').count, 1);
  assert.equal(options.contract.find(option => option.value === '契約なし').count, 1);
  assert.deepEqual(getDeckFilterOptions([]).pack, []);
});

test('ヒット度は採用枚数の割合。複数条件はデッキ単位のANDと割合の平均', () => {
  const profile = createDeckProfile([{ count: 30, faces: [red] }, { count: 10, faces: [blue] }]);
  assert.deepEqual(match(profile, { color: '赤' }), { matches: true, score: 0.75 });
  assert.deepEqual(match(profile, { color: '赤', tribe: 'FT' }), { matches: true, score: 0.5 });
  assert.equal(match(profile, { tribe: '存在しない' }).matches, false);
  assert.equal(match(profile, { contract: '契約なし' }).matches, false);
  assert.equal(match(profile, { contract: ' ルーシィ ' }).score, 0.25);
  assert.deepEqual(match(profile, {}), { matches: true, score: null });
});

test('両面・複数系統が一致しても同じカードは一度だけ数え、不明カードは分母に含める', () => {
  const profile = createDeckProfile([{ count: 3, faces: [red, { ...blue, tribe: '幻想／幻想竜' }] }, { count: 1, faces: [] }]);
  assert.equal(profile.total, 4);
  assert.equal(match(profile, { tribe: '幻想' }).score, 0.75);
  assert.equal(match(profile, { color: '多色' }).score, 0.75);
  assert.equal(match(profile, { pack: blue.pack }).score, 0.75);
  assert.equal(match(createDeckProfile([]), { color: '赤' }).matches, false);
  assert.deepEqual(match(createDeckProfile([]), {}), { matches: true, score: null });
});

test('ヒット度で中心デッキを優先し、昇順も選べ、同点・条件なしは保存順を保つ', () => {
  const decks = [{ name: '1枚採用', score: 1 / 40 }, { name: '中心', score: 30 / 40 }, { name: '同点', score: 30 / 40 }];
  assert.deepEqual(sortSavedDecks(decks, 'hit', 'desc', () => [], d => d.score).map(d => d.name), ['中心', '同点', '1枚採用']);
  assert.deepEqual(sortSavedDecks(decks, 'hit', 'asc', () => [], d => d.score), decks);
  assert.deepEqual(sortSavedDecks(decks, 'hit', 'desc', () => []), decks);
});

test('React保存カードから両面の色・パック・契約名を復元する', () => {
  const profile = profileFromSavedCards([{ count: 2, isDoubleSided: true, front: { color: ['赤'], tribe: '幻想', pack: red.pack, type: 'スピリット' }, back: { color: ['青'], pack: blue.pack, type: '契約スピリット', name: 'ルーシィ' } }]);
  assert.equal(match(profile, { contract: 'ルーシィ', color: '青', pack: blue.pack }).score, 1);
});
