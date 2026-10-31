import { test } from 'node:test';
import assert from 'node:assert/strict';
import cardData from '../cardData.js';
import { PACK_OPTIONS, getPackLabel, matchesPackSearch } from './deckPacks.js';
import { EMPTY_DECK_FILTERS, getDeckFilterOptions, matchDeckProfile, profileFromSavedCards } from './savedDeckFilters.js';

test('正式な作品名と従来表記の検索で同じ実カードが見つかる', () => {
  const before = JSON.stringify(cardData);
  const findIds = query => cardData.filter(card =>
    (card.isDoubleSided ? [card.front, card.back] : [card]).some(face => matchesPackSearch(face.pack, query))
  ).map(card => card.id);
  for (const [legacy, title] of [
    ['るろうに心剣', 'るろうに剣心'],
    ['東方憑依花', '東方憑依華'],
    ['ソードアートオンライン', 'ソードアート・オンライン'],
    ['公理協会', '公理教会'],
  ]) {
    const ids = findIds(title);
    assert.ok(ids.length > 0, title);
    assert.deepEqual(findIds(legacy), ids, title);
    assert.ok(PACK_OPTIONS.some(pack => getPackLabel(pack).includes(title)), title);
  }
  assert.deepEqual(findIds('存在しない作品'), []);
  assert.equal(JSON.stringify(cardData), before, 'カードID・画像・パック値を変更しない');
});

test('保存済みパック値は正式表記で表示しても選択・件数・絞り込みを維持する', () => {
  for (const value of PACK_OPTIONS) {
    const profile = profileFromSavedCards([{ id: 1, count: 3, pack: value }]);
    const [option] = getDeckFilterOptions([profile]).pack;
    assert.deepEqual(option, { value, count: 1 });
    assert.deepEqual(matchDeckProfile(profile, { ...EMPTY_DECK_FILTERS, pack: option.value }), { matches: true, score: 1 });
    assert.equal(getPackLabel(value).split(' ')[0], value.split(' ')[0], 'パックIDを維持');
    assert.equal(getPackLabel(getPackLabel(value)), getPackLabel(value));
  }
  assert.equal(getPackLabel('BSRK01 るろうに心剣'), 'BSRK01 るろうに剣心');
  assert.equal(getPackLabel('BSTH10.5 東方憑依花'), 'BSTH10.5 東方憑依華');
  assert.equal(getPackLabel('BSSA01 ソードアートオンライン-アリシゼーション-公理協会編'), 'BSSA01 ソードアート・オンライン-アリシゼーション-公理教会編');
  assert.equal(getPackLabel('未知のパック'), '未知のパック');
  assert.equal(getPackLabel(null), '');
});
