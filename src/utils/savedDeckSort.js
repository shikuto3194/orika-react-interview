import { PACK_OPTIONS } from './deckPacks.js';

const packRanks = new Map(PACK_OPTIONS.map((pack, index) => [pack.split(' ')[0], index]));
const collator = new Intl.Collator('ja', { numeric: true });

function comparePacks(a, b) {
  return (packRanks.get(a) ?? 999) - (packRanks.get(b) ?? 999) || collator.compare(a, b);
}

// Count copies, not card types. A double-sided card contributes only its front pack.
export function dominantPack(entries) {
  const counts = new Map();
  for (const { pack, count } of entries) {
    const key = String(pack || '').trim().split(/\s+/)[0];
    const copies = Number(count);
    if (!key || !Number.isFinite(copies) || copies <= 0) continue;
    counts.set(key, (counts.get(key) || 0) + copies);
  }
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || comparePacks(a, b))[0] ?? null;
}

export function withDeckSaveTimes(deck, existing, now = new Date().toISOString()) {
  return { ...deck, createdAt: existing ? existing.createdAt : now, updatedAt: now };
}

export function sortSavedDecks(decks, key, direction, getPackEntries, getHitScore = () => null) {
  const sign = direction === 'desc' ? -1 : 1;
  return decks.map((deck, index) => ({
    deck,
    index,
    pack: key === 'pack' ? dominantPack(getPackEntries(deck)) : null,
  })).sort((a, b) => {
    let comparison = 0;
    if (key === 'hit') {
      comparison = (getHitScore(a.deck) ?? 0) - (getHitScore(b.deck) ?? 0);
      return sign * comparison || a.index - b.index;
    } else if (key === 'pack') {
      // Empty decks or missing pack data always follow known packs.
      if (a.pack === null || b.pack === null) {
        if (a.pack !== b.pack) return a.pack === null ? 1 : -1;
      } else comparison = comparePacks(a.pack, b.pack);
    } else if (key === 'name') {
      comparison = collator.compare(a.deck.name || '', b.deck.name || '');
    } else {
      const time = deck => Date.parse((key === 'updated' ? deck.updatedAt : deck.createdAt) || deck.createdAt || '') || 0;
      comparison = time(a.deck) - time(b.deck);
    }
    return sign * (comparison || a.index - b.index);
  }).map(({ deck }) => deck);
}
