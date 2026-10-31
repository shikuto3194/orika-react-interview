import cardData from '../cardData';
import { PACK_OPTIONS } from './deckPacks';

// カードIDマップ（一度だけ作成）
export const cardMapById = new Map();
cardData.forEach(c => { cardMapById.set(c.id, c); });

// オブジェクト形式のカードマップ（EventsPage, MyPage 等で使用）
export const cardMapByIdObj = {};
cardData.forEach(c => { cardMapByIdObj[c.id] = c; });

// 相対パス → 絶対パスに変換（/events/:id 配下でも画像が表示されるように）
export const toAbsPath = (p) => p && !p.startsWith('/') && !p.startsWith('http') ? `/${p}` : p;

// リハイドレート（minimal → full card）
export function rehydrateCard(saved) {
  if (!saved) return saved;
  const base = saved.id ? cardMapById.get(Number(saved.id)) : null;
  if (!base) return saved;
  return { ...base, count: saved.count ?? base.count ?? 0, isDeckThumbnail: !!saved.isDeckThumbnail };
}

export function rehydrateCards(savedCards = []) {
  return savedCards.map(rehydrateCard);
}

export function collectRelatedTokensFromCards(cards = []) {
  const out = [];
  const seen = new Set();
  for (const card of cards) {
    const rel = card.relatedTokens || [];
    for (const name of rel) {
      if (seen.has(name)) continue;
      const token = cardData.find(c => c.name === name);
      if (token) { out.push(token); seen.add(name); }
    }
  }
  return out;
}

// カードソート関数（デッキ内カード専用）
const packOrder = PACK_OPTIONS;

export function getTypeRank(card) {
  const isDoubleSided = card.isDoubleSided && card.front && card.back;
  const type = isDoubleSided ? card.front.type : card.type;
  const tribe = isDoubleSided ? card.front.tribe : card.tribe;
  if (type && type.includes('契約')) return 0;
  if (type && type.includes('スピリット')) return 1;
  if (type && type.includes('アルティメット')) return 2;
  if (type && type.includes('ブレイヴ')) return 3;
  if (type && type.includes('ネクサス') && tribe && tribe.includes('創界神')) return 4;
  if (type && type.includes('ネクサス') && tribe && tribe.includes('導界者')) return 5;
  if (type && type.includes('ネクサス') && tribe && tribe.includes('創界石')) return 5.5;
  if (type && type.includes('ネクサス')) return 6;
  if (type && type.includes('マジック')) return 7;
  return 99;
}

export function getPackRank(card) {
  const isDoubleSided = card.isDoubleSided && card.front && card.back;
  const pack = isDoubleSided ? (card.front.pack || card.back.pack) : card.pack;
  const idx = packOrder.indexOf(pack);
  return idx === -1 ? 999 : idx;
}

export function sortDeckCards(cards) {
  return [...cards].sort((a, b) => {
    const typeA = getTypeRank(a);
    const typeB = getTypeRank(b);
    if (typeA !== typeB) return typeA - typeB;
    const costA = a.isDoubleSided && a.front ? a.front.cost : a.cost;
    const costB = b.isDoubleSided && b.front ? b.front.cost : b.cost;
    if (costA !== costB) return costA - costB;
    const packA = getPackRank(a);
    const packB = getPackRank(b);
    if (packA !== packB) return packA - packB;
    const nameA = a.isDoubleSided && a.front ? a.front.name : a.name;
    const nameB = b.isDoubleSided && b.front ? b.front.name : b.name;
    return nameA.localeCompare(nameB, 'ja');
  });
}
