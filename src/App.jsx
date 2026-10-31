import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { supabase, APP_GAME_ID } from './supabaseClient';
import { upsertCloudDeck, deleteCloudDeck } from './useDeckCloud.js';
import { useDeckLibrary } from './useDeckLibrary';
import { errataData } from './errataData';
import cardData from './cardData';
import qaData from './qaData';
import { versionedImageUrl } from './imageUrl';
import './App.css';
import './CardList.css';
import './styles/builder-layout.css';
import { FixedSizeList, FixedSizeGrid } from 'react-window';

import CardDetailModal from './components/CardDetailModal';
import ExportFilesModal from './components/ExportFilesModal';
import { sortDeckCards, rehydrateCards as rehydrateSavedCards } from './utils/deckUtils';
import { PACK_OPTIONS, getPackLabel, matchesPackSearch } from './utils/deckPacks';
import { sortSavedDecks, withDeckSaveTimes } from './utils/savedDeckSort';
import SavedDeckSort from './components/SavedDeckSort';
import SavedDeckFilters from './components/SavedDeckFilters';
import { EMPTY_DECK_FILTERS, profileFromSavedCards, getDeckFilterOptions, matchDeckProfile } from './utils/savedDeckFilters';

// CardDetailModal は ./components/CardDetailModal.jsx から import 済み
// ExportFilesModal は ./components/ExportFilesModal.jsx から import 済み

function isIOSDevice() {
  try {
    const ua = navigator.userAgent || '';
    const iOSByUA = /iPad|iPhone|iPod/.test(ua);
    const iPadOSByPlatform = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return iOSByUA || iPadOSByPlatform;
  } catch {
    return false;
  }
}

const ARCHETYPE_CARD_THRESHOLD = 10;
const DECK_ARCHETYPE_SHARE_THRESHOLD = 0.5;
const ARCHETYPE_NAME_OVERRIDES = {
  '東方靈異伝': '靈異伝',
  '東方封魔録': '封魔録',
  '東方夢時空': '夢時空',
  '東方紅魔郷': '紅魔郷',
  '東方妖々夢': '妖々夢',
  '夢違科学世紀': '夢違',
  '東方永夜抄': '永夜抄',
  '東方花映塚': '花映塚',
  '東方風神録': '風神録',
  '東方緋想天': '緋想天',
  '東方地霊殿': '地霊殿',
  '東方星蓮船': '星蓮船',
  '妖精大戦争': '大戦争',
  '東方神霊廟': '神霊廟',
  '東方心綺楼': '心綺楼',
  '東方輝針城': '輝針城',
  '東方天空璋': '天空璋',
  'ソードアート・オンライン-アリシゼーション-公理教会編': '公理教会',
  'ゴッドイーター': 'ゴッド',
  'アルドノア・ゼロ-地球-': '地球',
  'アルドノア・ゼロ-火星-': '火星',
  '戦姫絶唱シンフォギア-切歌＆調-': '切調',
  'フェアリーテイル-ルーシィ・ハートフィリア-': 'ルーシィ',
  '８６-エイティシックス-': '８６',
  '俺だけレベルアップな件': '俺レベ',
  'るろうに剣心': '剣心',
  '転生したらスライムだった件': '転スラ',
  'ドラゴンボールZ': 'DBZ',
  '英雄伝説 軌跡シリーズ': '軌跡',
  '星のカービィシリーズ-メタナイト編-': 'メタナイト',
};

function getArchetypeKeyFromCardNumber(cardNumber) {
  const raw = String(cardNumber || '').trim();
  const match = raw.match(/^(.+?)-(?=(?:転醒)?(?:CX|TX|TR|XX|[CMRXT])\d)/);
  if (match) return match[1].trim();
  const fallback = raw.split('-')[0]?.trim();
  return fallback || '';
}

function getArchetypeKeyFromPack(pack) {
  const prefix = String(pack || '').trim().split(/\s+/)[0];
  return prefix || '';
}

function getCardArchetypePrints(card) {
  const faces = card?.isDoubleSided && card.front && card.back
    ? [card.front, card.back]
    : [card];
  const prints = [];
  const seenKeys = new Set();

  for (const face of faces) {
    const key = getArchetypeKeyFromCardNumber(face?.cardNumber) || getArchetypeKeyFromPack(face?.pack);
    if (!key || seenKeys.has(key)) continue;

    seenKeys.add(key);
    prints.push({
      key,
      pack: face?.pack || card?.pack || key,
    });
  }

  return prints;
}

function getPackTitle(pack) {
  return getPackLabel(pack).replace(/^[A-Z0-9.-]+\s*/, '').trim();
}

function getArchetypeName(pack) {
  const base = getPackTitle(pack);
  if (ARCHETYPE_NAME_OVERRIDES[base]) return ARCHETYPE_NAME_OVERRIDES[base];

  const parts = base.split('-').map(part => part.trim()).filter(Boolean);
  let name = parts.length > 1 ? parts[parts.length - 1] : base;
  name = name
    .replace(/^東方/, '')
    .replace(/シリーズ/g, '')
    .replace(/編$/, '')
    .replace(/[（）()]/g, '')
    .trim();

  const chars = Array.from(name);
  return chars.length > 5 ? chars.slice(0, 5).join('') : (name || base);
}

// --- ヘッダー右上のログイン状態表示 ---
function UserBadge() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <button
        onClick={() => navigate('/login')}
        style={{
          background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6,
          padding: '0.5em 1em', fontSize: '0.9em', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        ログイン
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => navigate('/events')}
        style={{
          background: 'none', border: '1px solid #ff9800', color: '#ff9800', borderRadius: 6,
          padding: '0.5em 0.9em', fontSize: '0.85em', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        イベント
      </button>
      <button
        onClick={() => navigate('/mypage')}
        style={{
          background: 'none', border: '1px solid #1976d2', color: '#1976d2', borderRadius: 6,
          padding: '0.5em 0.9em', fontSize: '0.85em', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        マイページ
      </button>
      <button
        onClick={async () => { await signOut(); }}
        style={{
          background: '#e0e0e0', color: '#333', border: 'none', borderRadius: 6,
          padding: '0.5em 0.9em', fontSize: '0.85em', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        ログアウト
      </button>
    </div>
  );
}

const CardRow = React.memo(function CardRow({ index, style, data }) {
    const { decreaseCardCount, decreaseTokenCount, getCardCountInDeck, increaseCardCount, increaseTokenCount, itemTouchHandlers, openCardDetail, tokenDeck } = data.context;
    const card = data.cards[index];
    if (!card) return null;
    const countInMainDeck = getCardCountInDeck(card.id);
    // ダブルフェイス対応
    const isDoubleSided = card.isDoubleSided && card.front && card.back;
    const displayCard = isDoubleSided ? card.front : card;
    const typeText = isDoubleSided ? `${card.front.type} / ${card.back.type}` : card.type;
    const isToken = isDoubleSided
      ? (card.front.type?.includes('トークン') || card.back.type?.includes('トークン'))
      : (card.type?.includes('トークン'));
    const count = isToken ? (tokenDeck[card.id] || 0) : countInMainDeck;
    const maxCount = isToken ? (card.maxTokenDeckCount ?? 9) : (card.maxDeckCount ?? 3);
    return (
      <div
        className="card-item"
        style={{ ...style, touchAction: 'pan-y', cursor: 'pointer' }}
        key={card.id}
        {...itemTouchHandlers}
        onClick={e => {
          // +/−ボタン以外のクリックで詳細
          if (
            e.target.classList.contains('plusBtn') ||
            e.target.classList.contains('minusBtn')
          ) return;
          openCardDetail(card);
        }}
      >
        <div className="card-grid-img-wrap" style={{ width: 48, height: 64, marginRight: 8 }}>
          <img src={displayCard.image} alt={displayCard.name} className="card-grid-img" style={{ width: '100%', height: '100%' }} />
        </div>
        <div className="card-info"><b>{card.name}</b> <span style={{ fontSize: '0.9em', color: '#666' }}>({typeText})</span></div>
        {maxCount > 0 && (
          <div className="card-controls">
            <button
              onClick={e => { e.stopPropagation(); isToken ? decreaseTokenCount(card.id) : decreaseCardCount(card.id); }}
              className={`minusBtn${isToken ? ' token-btn' : ''}`}
              disabled={count <= 0}
              style={isToken ? { background: '#ff9800' } : undefined}
            >-</button>
            <span>{count} / {maxCount}</span>
            <button
              onClick={e => { e.stopPropagation(); isToken ? increaseTokenCount(card.id) : increaseCardCount(card.id); }}
              className={`plusBtn${isToken ? ' token-btn' : ''}`}
              disabled={count >= maxCount}
              style={isToken ? { background: '#ff9800' } : undefined}
            >+</button>
          </div>
        )}
      </div>
    );
  });

const CardGridCell = React.memo(function CardGridCell({ columnIndex, rowIndex, style, data }) {
    const { decreaseCardCount, decreaseTokenCount, getCardCountInDeck, increaseCardCount, increaseTokenCount, itemTouchHandlers, openCardDetail, tokenDeck } = data.context;
    const { cards, columns } = data;
    const index = rowIndex * columns + columnIndex;
    if (index >= cards.length) return null;
    const card = cards[index];
    const countInMainDeck = getCardCountInDeck(card.id);
    const isDoubleSided = card.isDoubleSided && card.front && card.back;
    const displayCard = isDoubleSided ? card.front : card;
    const isToken = isDoubleSided
      ? (card.front.type?.includes('トークン') || card.back.type?.includes('トークン'))
      : (card.type?.includes('トークン'));
    const count = isToken ? (tokenDeck[card.id] || 0) : countInMainDeck;
    const maxCount = isToken ? (card.maxTokenDeckCount ?? 9) : (card.maxDeckCount ?? 3);
    return (
      <div
        style={{ ...style, padding: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'center', touchAction: 'pan-y', cursor: 'pointer' }}
        {...itemTouchHandlers}
        onClick={e => {
          // +/−ボタン以外のクリックで詳細
          if (
            e.target.classList.contains('plusBtn') ||
            e.target.classList.contains('minusBtn')
          ) return;
          openCardDetail(card);
        }}
      >
        <div
          className="card-grid-img-wrap"
          style={{
            width: '100%',
            height: '100%',
            aspectRatio: '385/561',
            background: '#fff',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 5,
            boxShadow: '0 1px 4px #bbb',
            overflow: 'hidden',
          }}
        >
          <img
            src={displayCard.image}
            alt={displayCard.name}
            className="card-grid-img"
            style={{
              width: '98%',
              height: '98%',
              aspectRatio: '385/561',
              objectFit: 'cover',
              borderRadius: 5,
              background: '#fff',
              boxShadow: 'none',
              cursor: 'pointer',
              display: 'block',
            }}
          />
          {count > 0 && (
            <span
              className="card-badge"
              style={{ position: 'absolute', top: 0, right: 0, background: isToken ? '#ff9800' : '#1976d2', color: '#fff', borderRadius: '50%', width: '1.7em', height: '1.7em', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1em', fontWeight: 'bold', boxShadow: '0 1px 4px #bbb', zIndex: 3, pointerEvents: 'none' }}
            >{count}</span>
          )}
          {maxCount > 0 && (
            <div
              className="card-grid-controls"
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 4,
                transform: 'translateX(-50%)',
                display: 'flex',
                gap: '0.3em',
                zIndex: 2,
              }}
            >
              <button
                className={`minusBtn${isToken ? ' token-outline-btn' : ''}`}
                style={{
                  width: '2em',
                  height: '2em',
                  borderRadius: '50%',
                  background: '#fff',
                  border: `2px solid ${isToken ? '#ff9800' : '#1976d2'}`,
                  color: isToken ? '#ff9800' : '#1976d2',
                  fontSize: '1.2em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 4px #bbb',
                  cursor: 'pointer',
                }}
                onClick={e => {
                  e.stopPropagation();
                  isToken ? decreaseTokenCount(card.id) : decreaseCardCount(card.id);
                }}
                disabled={count <= 0}
              >
                -
              </button>
              <button
                className={`plusBtn${isToken ? ' token-btn' : ''}`}
                style={{
                  width: '2em',
                  height: '2em',
                  borderRadius: '50%',
                  background: isToken ? '#ff9800' : '#1976d2',
                  border: `2px solid ${isToken ? '#ff9800' : '#1976d2'}`,
                  color: '#fff',
                  fontSize: '1.2em',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 4px #bbb',
                  cursor: 'pointer',
                }}
                onClick={e => {
                  e.stopPropagation();
                  isToken ? increaseTokenCount(card.id) : increaseCardCount(card.id);
                }}
                disabled={count >= maxCount}
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>
    );
  });

export default function CanvasCardApp() {
  const { user } = useAuth();
    return <DeckApp key={user?.id || 'guest'} />;
}

function DeckApp() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [deck, setDeck] = useState([]);
  const [tokenDeck, setTokenDeck] = useState({}); // id -> count（トークン専用）
  const [deckThumbnailCardId, setDeckThumbnailCardId] = useState(null); // メイン/トークン共通のサムネイルID
  const [exportFilesModal, setExportFilesModal] = useState(null);

  const [savedDecks, setSavedDecks] = useState(() => {
    if (user) return [];
    const decks = localStorage.getItem('savedCanvasDecks');
    return decks ? JSON.parse(decks) : [];
  });

  const userId = user?.id ?? null;
  const { library, error: libraryError } = useDeckLibrary(userId);
  const deckScope = library?.scope_key ?? null;
  const previousScope = useRef(null);
  useEffect(() => {
    if (!userId) {
      setSavedDecks(JSON.parse(localStorage.getItem('savedCanvasDecks') || '[]'));
      return;
    }
    setSavedDecks((library?.decks || []).map(row => ({
      _cloudId: row.id, name: row.name, cards: row.cards || [], tokenDeck: row.token_deck || [],
      thumbnailCardId: row.thumbnail_card_id ?? null,
      createdAt: row.created_at, updatedAt: row.updated_at,
    })));
  }, [userId, library]);
  useEffect(() => {
    if (previousScope.current && deckScope && previousScope.current !== deckScope) {
      setDeck([]); setTokenDeck({}); setDeckThumbnailCardId(null);
      setDeckName(''); setCurrentDeckName('');
    }
    if (deckScope) previousScope.current = deckScope;
  }, [deckScope]);
  const [deckName, setDeckName] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [currentDeckName, setCurrentDeckName] = useState('');
  const [showFront, setShowFront] = useState(true);
  const [showFilter, setShowFilter] = useState(false);
  const [filterColor, setFilterColor] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRarity, setFilterRarity] = useState('');
  const [filterTribe, setFilterTribe] = useState('');
  const [filterPack, setFilterPack] = useState('');
  const [filterCost, setFilterCost] = useState('');
  const [filterReduction, setFilterReduction] = useState('');
  const [filterSymbol, setFilterSymbol] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [savedDeckSearch, setSavedDeckSearch] = useState('');
  const [savedDeckSortKey, setSavedDeckSortKey] = useState('hit');
  const [savedDeckSortDirection, setSavedDeckSortDirection] = useState('desc');
  const [showSavedDeckOptions, setShowSavedDeckOptions] = useState(false);
  const [savedDeckFilters, setSavedDeckFilters] = useState(EMPTY_DECK_FILTERS);
  const [showDeckInfoModal, setShowDeckInfoModal] = useState(false);
  const [qaQuery, setQaQuery] = useState('');
  const tabOrder = useMemo(() => ['home', 'search', 'deck', 'saved', 'qa'], []);
  const tabContentWrapRef = useRef(null);

  const homeContainerRef = useRef(null);
  const searchContainerRef = useRef(null);
  const listContainerRef = useRef(null);
  const deckContainerRef = useRef(null);
  const savedContainerRef = useRef(null);
  const qaContainerRef = useRef(null);
  // 旧PNGキャプチャは削除。SVGベース出力のみ使用。

  const closeExportFilesModal = () => {
    try {
      const files = exportFilesModal?.files;
      if (Array.isArray(files)) {
        for (const f of files) {
          if (f?.url) URL.revokeObjectURL(f.url);
        }
      }
    } catch {
      // ignore
    }
    setExportFilesModal(null);
  };

  const openExportFilesModal = (title, files) => {
    setExportFilesModal({ title, files });
  };

  const resetFilters = () => {
    setSearch('');
    setFilterColor('');
    setFilterType('');
    setFilterRarity('');
    setFilterTribe('');
    setFilterPack('');
    setFilterCost('');
    setFilterReduction('');
    setFilterSymbol('');
    // 系統のドロップダウンも閉じる
    setTribeDropdownOpen(false);
  };

  // 系統の候補一覧（入力補助用）
  const tribeOptions = useMemo(() => {
    const set = new Set();
    for (const card of cardData) {
      const sides = (card.isDoubleSided && card.front && card.back) ? [card.front, card.back] : [card];
      for (const s of sides) {
        const t = (s.tribe || '').trim();
        if (!t) continue;
        // 複数系統は「・」「/」「／」で区切られている想定
        t.split(/[・/／]/).map(x => x.trim()).filter(Boolean).forEach(x => set.add(x));
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }, []);

  // 系統コンボボックス（スマホでも選択リストを出すための簡易ドロップダウン）
  const [tribeDropdownOpen, setTribeDropdownOpen] = useState(false);
  const tribeDropdownRef = useRef(null);
  const filteredTribeOptions = useMemo(() => {
    const q = (filterTribe || '').toLowerCase();
    if (!q) return tribeOptions;
    return tribeOptions.filter(o => o.toLowerCase().includes(q));
  }, [tribeOptions, filterTribe]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (tribeDropdownRef.current && !tribeDropdownRef.current.contains(e.target)) {
        setTribeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, []);


  // QA 検索
  const filteredQa = useMemo(() => {
    const q = qaQuery.trim().toLowerCase();
    if (!q) return qaData;
    return qaData.filter(item => {
      const hay = [item.question, item.answer, (item.tags || []).join(' ')].join(' \n ').toLowerCase();
      return hay.includes(q) || matchesPackSearch((item.tags || []).join(' '), q);
    });
  }, [qaQuery]);

  // QA の開閉・ホバー状態
  const [qaOpen, setQaOpen] = useState({});
  const [qaHover, setQaHover] = useState({});
  const toggleQa = (id) => setQaOpen(prev => ({ ...prev, [id]: !prev[id] }));

  // --- 最新カードデータへの再結合（リハイドレート）ヘルパー ---
  const cardMapById = useMemo(() => {
    const m = new Map();
    for (const c of cardData) m.set(c.id, c);
    return m;
  }, []);
  const rehydrateCard = (saved) => {
    if (!saved) return saved;
    const base = saved.id ? cardMapById.get(saved.id) : null;
    if (!base) return saved; // 予備: 見つからなければそのまま
    return { ...base, count: saved.count ?? base.count ?? 0, isDeckThumbnail: !!saved.isDeckThumbnail };
  };
  const rehydrateCards = (savedCards = []) => savedCards.map(rehydrateCard);
  const collectRelatedTokensFromCards = (cards = []) => {
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
  };

  const deckInfo = useMemo(() => {
    const archetypeCandidates = new Map();
    for (const card of cardData) {
      for (const print of getCardArchetypePrints(card)) {
        if (!archetypeCandidates.has(print.key)) {
          archetypeCandidates.set(print.key, { key: print.key, pack: print.pack, cardIds: new Set() });
        }

        const candidate = archetypeCandidates.get(print.key);
        if ((!candidate.pack || candidate.pack === candidate.key) && print.pack) {
          candidate.pack = print.pack;
        }
        candidate.cardIds.add(Number(card.id));
      }
    }

    const archetypes = [...archetypeCandidates.values()]
      .filter(candidate => candidate.cardIds.size >= ARCHETYPE_CARD_THRESHOLD)
      .map(candidate => ({
        key: candidate.key,
        pack: candidate.pack,
        packTitle: getPackTitle(candidate.pack),
        name: getArchetypeName(candidate.pack),
        cardTypeCount: candidate.cardIds.size,
      }));
    const eligibleKeys = new Set(archetypes.map(archetype => archetype.key));

    const coveredKeys = new Set();
    for (const saved of savedDecks) {
      const deckPackCounts = new Map();
      let deckTotal = 0;
      const addCardToDeckCounts = (card, count) => {
        if (!card || count <= 0) return;
        deckTotal += count;
        for (const print of getCardArchetypePrints(card)) {
          deckPackCounts.set(print.key, (deckPackCounts.get(print.key) || 0) + count);
        }
      };

      for (const savedCard of saved.cards || []) {
        const count = Number(savedCard?.count) || 0;
        if (count <= 0) continue;

        const id = Number(savedCard?.id);
        if (!Number.isFinite(id)) continue;

        const card = cardMapById.get(id) || savedCard;
        addCardToDeckCounts(card, count);
      }

      const tokenEntries = Array.isArray(saved.tokenDeck)
        ? saved.tokenDeck
        : (saved.tokenDeck && typeof saved.tokenDeck === 'object')
          ? Object.entries(saved.tokenDeck).map(([id, count]) => ({ id, count }))
          : [];
      for (const tokenEntry of tokenEntries) {
        const count = Number(tokenEntry?.count) || 0;
        if (count <= 0) continue;

        const id = Number(tokenEntry?.id);
        if (!Number.isFinite(id)) continue;

        addCardToDeckCounts(cardMapById.get(id), count);
      }

      if (deckTotal <= 0 || deckPackCounts.size === 0) continue;

      const [mainKey, mainCount] = [...deckPackCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0];
      if (
        eligibleKeys.has(mainKey) &&
        mainCount / deckTotal >= DECK_ARCHETYPE_SHARE_THRESHOLD
      ) {
        coveredKeys.add(mainKey);
      }
    }

    const coveredArchetypes = archetypes.filter(archetype => coveredKeys.has(archetype.key));
    const missingArchetypes = archetypes.filter(archetype => !coveredKeys.has(archetype.key));

    return {
      totalDecks: savedDecks.length,
      totalArchetypes: archetypes.length,
      coveredArchetypes,
      missingArchetypes,
    };
  }, [cardMapById, savedDecks]);

  // --- 作成中デッキからトークン候補を抽出し、tokenDeckのキーを同期 ---
  useEffect(() => {
    const isTokenCard = (c) => {
      if (!c) return false;
      if (c.isDoubleSided && c.front && c.back) {
        return (c.front.type || '').includes('トークン') || (c.back.type || '').includes('トークン');
      }
      return (c.type || '').includes('トークン');
    };
    const tokenCards = collectRelatedTokensFromCards(deck);
    const relatedTokenIds = new Set(tokenCards.map(t => t.id));

    setTokenDeck(prev => {
      const next = { ...prev };

      // 既存 tokenDeck をクランプ／不正値を掃除
      for (const [idStr, rawCount] of Object.entries(next)) {
        const id = Number(idStr);
        const token = cardData.find(c => c.id === id);
        if (!token || !isTokenCard(token)) {
          delete next[idStr];
          continue;
        }
        const maxT = token.maxTokenDeckCount ?? 9;
        const count = Math.max(0, Math.min(Number(rawCount) || 0, maxT));
        next[idStr] = count;
        // 関連トークンでもなく、0枚なら保持する必要がないので削除
        if (count <= 0 && !relatedTokenIds.has(id)) delete next[idStr];
      }

      // 作成中デッキに紐づくトークンはキーを必ず作る（0枚でも表示対象にできる）
      for (const t of tokenCards) {
        const key = String(t.id);
        const maxT = t.maxTokenDeckCount ?? 9;
        const cur = next[key] ?? 0;
        next[key] = Math.max(0, Math.min(Number(cur) || 0, maxT));
      }

      const changed = JSON.stringify(next) !== JSON.stringify(prev);
      return changed ? next : prev;
    });
  }, [deck]);

  const increaseTokenCount = React.useCallback((tokenId) => {
    const token = cardData.find(c => c.id === tokenId);
    if (!token) return;
    const maxT = token.maxTokenDeckCount ?? 9;
    const cur = tokenDeck[tokenId] || 0;
    if (cur >= maxT) return;
    setTokenDeck(prev => ({ ...prev, [tokenId]: cur + 1 }));
  }, [setTokenDeck, tokenDeck]);
  const decreaseTokenCount = React.useCallback((tokenId) => {
    const cur = tokenDeck[tokenId] || 0;
    if (cur <= 0) return;
    setTokenDeck(prev => ({ ...prev, [tokenId]: cur - 1 }));
  }, [setTokenDeck, tokenDeck]);

  const increaseCardCount = React.useCallback((cardId) => {
    const cardToAdd = cardData.find((c) => c.id === cardId);
    const isTokenCard = (c) => {
      if (!c) return false;
      if (c.isDoubleSided && c.front && c.back) {
        return (c.front.type || '').includes('トークン') || (c.back.type || '').includes('トークン');
      }
      return (c.type || '').includes('トークン');
    };
    const getMaxCount = (c) => (isTokenCard(c) ? 0 : (c?.maxDeckCount ?? 3));
    const maxCount = getMaxCount(cardToAdd);
    if (cardToAdd && maxCount === 0) return; // 上限0なら追加不可
    if (isTokenCard(cardToAdd)) {
      alert('トークンカードはデッキに入れられません。');
      return;
    }
    // 「契約」タイプ制限
    const isKeiyaku = (card) => {
      if (card.isDoubleSided && card.front && card.back) {
        return card.front.type.includes('契約') || card.back.type.includes('契約');
      }
      return card.type && card.type.includes('契約');
    };
    if (isKeiyaku(cardToAdd)) {
      // 既にデッキ内に他の契約カードがあるか
      const alreadyKeiyaku = deck.some(c => c.id !== cardId && isKeiyaku(c));
      if (alreadyKeiyaku) {
        alert('契約カードはデッキに1種類しか入れられません。');
        return;
      }
    }
    const existingCard = deck.find((c) => c.id === cardId);
    if (existingCard) {
      if (existingCard.count >= maxCount) return;
      setDeck(deck.map((c) => c.id === cardId ? { ...c, count: c.count + 1 } : c));
    } else {
      if (cardToAdd) {
        // 関連トークンを持つカードを「追加」したタイミングで、トークンデッキに初期値(9)を自動投入
        // ※ユーザーが既に tokenDeck に値を持っている（0含む）場合は上書きしない
        if (Array.isArray(cardToAdd.relatedTokens) && cardToAdd.relatedTokens.length > 0) {
          const isTokenCard = (c) => {
            if (!c) return false;
            if (c.isDoubleSided && c.front && c.back) {
              return (c.front.type || '').includes('トークン') || (c.back.type || '').includes('トークン');
            }
            return (c.type || '').includes('トークン');
          };
          setTokenDeck(prev => {
            const next = { ...prev };
            for (const tokenName of cardToAdd.relatedTokens) {
              const token = cardData.find(c => c.name === tokenName);
              if (!token || !isTokenCard(token)) continue;
              const key = String(token.id);
              if (Object.prototype.hasOwnProperty.call(next, key)) continue;
              const maxT = token.maxTokenDeckCount ?? 9;
              const initial = Math.min(9, maxT);
              if (initial > 0) next[key] = initial;
            }
            const changed = JSON.stringify(next) !== JSON.stringify(prev);
            return changed ? next : prev;
          });
        }
        setDeck([...deck, { ...cardToAdd, count: 1 }]);
      }
    }
  }, [deck, setDeck, setTokenDeck]);

  const decreaseCardCount = React.useCallback((cardId) => {
    const cardToRemove = cardData.find((c) => c.id === cardId);
    const isTokenCard = (c) => {
      if (!c) return false;
      if (c.isDoubleSided && c.front && c.back) {
        return (c.front.type || '').includes('トークン') || (c.back.type || '').includes('トークン');
      }
      return (c.type || '').includes('トークン');
    };
    const getMaxCount = (c) => (isTokenCard(c) ? 0 : (c?.maxDeckCount ?? 3));
    if (cardToRemove && getMaxCount(cardToRemove) === 0) return;
    setDeck(
      deck
        .map((c) => c.id === cardId ? { ...c, count: c.count - 1 } : c)
        .filter((c) => c.count > 0)
    );
  }, [deck, setDeck]);

  const filteredCards = useMemo(() => cardData.filter((card) => {
    // ダブルフェイス対応: 検索・フィルター対象を拡張
    const isDoubleSided = card.isDoubleSided && card.front && card.back;
    // 検索対象テキスト
    const name = isDoubleSided ? `${card.front.name} ${card.back.name}` : card.name;
    const effect = isDoubleSided ? `${card.front.effect || ''} ${card.back.effect || ''}` : card.effect || '';
    const color = isDoubleSided ? [...new Set([...(card.front.color||[]), ...(card.back.color||[])])] : card.color || [];
    const symbol = isDoubleSided ? [...new Set([...(card.front.symbol||[]), ...(card.back.symbol||[])])] : card.symbol || [];
    const type = isDoubleSided ? `${card.front.type} ${card.back.type}` : card.type;
    const rarity = isDoubleSided ? [card.front.rarity||'', card.back.rarity||''] : [card.rarity||''];
    const tribe = isDoubleSided ? `${card.front.tribe||''} ${card.back.tribe||''}` : card.tribe||'';
    const cost = isDoubleSided ? `${card.front.cost} ${card.back.cost}` : card.cost;
    const reduction = isDoubleSided ? [...new Set([...(card.front.reduction||[]), ...(card.back.reduction||[])])] : card.reduction || [];
    const pack = isDoubleSided ? `${card.front.pack||''} ${card.back.pack||''}` : card.pack||'';

    const keyword = search.toLowerCase();
    const matchesSearch =
      name.toLowerCase().includes(keyword) ||
      effect.toLowerCase().includes(keyword) ||
      color.join('').toLowerCase().includes(keyword) ||
      symbol.join('').toLowerCase().includes(keyword) ||
      type.toLowerCase().includes(keyword) ||
      rarity.join(' ').toLowerCase().includes(keyword) ||
      tribe.toLowerCase().includes(keyword) ||
      cost.toString().includes(keyword) ||
      reduction.join('').toLowerCase().includes(keyword) ||
      pack.toLowerCase().includes(keyword) || matchesPackSearch(pack, keyword);
    const matchesColor = !filterColor || (
      filterColor === '多色'
        ? (Array.isArray(color) && color.length >= 2)
        : (Array.isArray(color) ? color.includes(filterColor) : color === filterColor)
    );
    const matchesType = !filterType || (type.includes ? type.includes(filterType) : type === filterType);
    const matchesRarity = !filterRarity || rarity.includes(filterRarity);
    const matchesTribe = !filterTribe || tribe.toLowerCase().includes(filterTribe.toLowerCase());
    const matchesPack = !filterPack || (pack.includes ? pack.includes(filterPack) : pack === filterPack);
    const matchesCost = !filterCost || cost.toString().split(' ').includes(filterCost);
    const matchesReduction = !filterReduction || reduction.includes(filterReduction);
    const matchesSymbol = !filterSymbol || symbol.join('').toLowerCase().includes(filterSymbol.toLowerCase());
    return (
      matchesSearch &&
      matchesColor &&
      matchesType &&
      matchesRarity &&
      matchesTribe &&
      matchesPack &&
      matchesCost &&
      matchesReduction &&
      matchesSymbol
    );
  }), [filterColor, filterCost, filterPack, filterRarity, filterReduction, filterSymbol, filterTribe, filterType, search]);

  const savedDeckProfiles = useMemo(() => new Map(savedDecks.map(saved =>
    [saved, profileFromSavedCards(rehydrateSavedCards(saved.cards || []))]
  )), [savedDecks]);
  const savedDeckFilterOptions = useMemo(() => getDeckFilterOptions([...savedDeckProfiles.values()]), [savedDeckProfiles]);
  const savedDeckMatches = useMemo(() => new Map(savedDecks.map(saved =>
    [saved, matchDeckProfile(savedDeckProfiles.get(saved), savedDeckFilters)]
  )), [savedDecks, savedDeckProfiles, savedDeckFilters]);
  const filteredSavedDecks = useMemo(() => {
    const keyword = savedDeckSearch.trim().toLowerCase();
    const filtered = savedDecks.filter(saved => String(saved.name || '').toLowerCase().includes(keyword) && savedDeckMatches.get(saved).matches);
    return sortSavedDecks(filtered, savedDeckSortKey, savedDeckSortDirection, saved =>
      rehydrateSavedCards(saved.cards || []).map(card => ({
        pack: card.isDoubleSided ? (card.front?.pack || card.back?.pack || card.pack) : card.pack,
        count: card.count,
      })), saved => savedDeckMatches.get(saved).score
    );
  }, [savedDecks, savedDeckSearch, savedDeckSortKey, savedDeckSortDirection, savedDeckMatches]);

  const deckCounts = useMemo(() => new Map(deck.map(card => [card.id, card.count])), [deck]);
  const getCardCountInDeck = React.useCallback(cardId => deckCounts.get(cardId) || 0, [deckCounts]);

  /**
   * 指定デッキ名が開催中(in_progress)のイベントで登録済みかチェック
   * @returns {Promise<string|null>} イベント名 or null
   */
  const getLockedEventName = async (deckNameToCheck) => {
    if (!user || !deckNameToCheck) return null;
    // deck_name または deck_name_2 が一致する参加レコードを取得
    const { data: parts } = await supabase
      .from('event_participants')
      .select('event_id')
      .eq('user_id', user.id)
      .or(`deck_name.eq.${deckNameToCheck},deck_name_2.eq.${deckNameToCheck}`);
    if (!parts || parts.length === 0) return null;
    const eventIds = [...new Set(parts.map(p => p.event_id))];
    const { data: events } = await supabase
      .from('events')
      .select('id, name, status')
      .in('id', eventIds)
      .eq('game', APP_GAME_ID)
      .in('status', ['in_progress', 'recruiting']);
    if (events && events.length > 0) return events[0].name;
    return null;
  };

  const saveCurrentDeck = async () => {
    if (!deckName) {
      alert('デッキ名を入力してください');
      return;
    }
    // 最小形式で保存（id, count, isDeckThumbnail のみ）
    const minimalCards = deck.map(c => ({ id: c.id, count: c.count || 0, isDeckThumbnail: !!c.isDeckThumbnail }));
    // 0枚は保存しない（トークン0枚なら「トークン無し」として扱えるようにする）
    const minimalTokens = Object.entries(tokenDeck)
      .map(([id, count]) => ({ id: Number(id), count: Number(count) || 0 }))
      .filter(t => t.count > 0);

    const normalizedThumbId = (() => {
      const id = Number(deckThumbnailCardId);
      if (!Number.isFinite(id)) return null;
      const inMain = deck.some(c => Number(c.id) === id);
      const inTokens = (Number(tokenDeck?.[id]) || 0) > 0;
      return (inMain || inTokens) ? id : null;
    })();

    const fallbackThumbId =
      normalizedThumbId ??
      (deck.find(c => c.isDeckThumbnail)?.id ?? deck[0]?.id ?? minimalTokens[0]?.id ?? null);
    // 既存デッキ名チェック
    const existingIdx = savedDecks.findIndex(d => d.name === deckName);
    if (existingIdx !== -1) {
      // イベントロックチェック
      const lockedBy = await getLockedEventName(deckName);
      if (lockedBy) { alert(`デッキ「${deckName}」はイベント「${lockedBy}」で使用されているため、編集できません。\nイベントページでデッキ登録を解除してから編集してください。`); return; }
      if (!window.confirm(`デッキ「${deckName}」を上書きしますか？`)) return;
      // 上書き
      const updatedDecks = savedDecks.map((d, i) =>
        i === existingIdx ? withDeckSaveTimes({ ...d, cards: minimalCards, tokenDeck: minimalTokens, thumbnailCardId: fallbackThumbId }, d) : d
      );
      if (user && !await upsertCloudDeck(user.id, { name: deckName, cards: minimalCards, tokenDeck: minimalTokens, thumbnailCardId: fallbackThumbId }, deckScope)) return;
      setSavedDecks(updatedDecks);
      setCurrentDeckName(deckName);
      setDeckName('');
      alert(`デッキ「${deckName}」を上書き保存しました！`);
      return;
    }
    const newDeck = withDeckSaveTimes({
      name: deckName,
      cards: minimalCards,
      tokenDeck: minimalTokens,
      thumbnailCardId: fallbackThumbId,
    });
    if (user && !await upsertCloudDeck(user.id, newDeck, deckScope)) return;
    setSavedDecks([...savedDecks, newDeck]);
    setCurrentDeckName(deckName);
    setDeckName('');
    alert(`デッキ「${deckName}」を保存しました！`);
  };

  const loadDeck = (name) => {
    const selectedDeck = savedDecks.find((d) => d.name === name);
    if (selectedDeck) {
      // 保存デッキのカードを最新データに再結合してロード
      const hydrated = rehydrateCards(selectedDeck.cards);
      setDeck(hydrated);
      // トークンデッキもロード（旧形式: tokenDeckが無い場合は関連トークンを9枚として初期化）
      const hasTokenDeckField = Object.prototype.hasOwnProperty.call(selectedDeck, 'tokenDeck');
      const map = {};
      if (hasTokenDeckField) {
        if (Array.isArray(selectedDeck.tokenDeck)) {
          for (const t of selectedDeck.tokenDeck) {
            if (!t || typeof t.id === 'undefined') continue;
            const cnt = Number(t.count) || 0;
            if (cnt > 0) map[Number(t.id)] = cnt;
          }
        } else if (selectedDeck.tokenDeck && typeof selectedDeck.tokenDeck === 'object') {
          for (const [id, cntRaw] of Object.entries(selectedDeck.tokenDeck)) {
            const cnt = Number(cntRaw) || 0;
            if (cnt > 0) map[Number(id)] = cnt;
          }
        }
      } else {
        // 旧型は「関連トークン=9枚」で読み込み
        const legacyTokenCards = collectRelatedTokensFromCards(hydrated);
        for (const t of legacyTokenCards) {
          const maxT = t.maxTokenDeckCount ?? 9;
          const cnt = Math.min(9, maxT);
          if (cnt > 0) map[Number(t.id)] = cnt;
        }
      }
      setTokenDeck(map);

      // サムネイルIDも復元（なければ従来のisDeckThumbnail/先頭カード/先頭トークン）
      const thumbFromCards = hydrated.find(c => c.isDeckThumbnail)?.id ?? hydrated[0]?.id ?? null;
      const thumbFromTokens = Object.entries(map).find(([, cnt]) => (Number(cnt) || 0) > 0)?.[0];
      const thumbId =
        (selectedDeck.thumbnailCardId ?? null) ??
        thumbFromCards ??
        (thumbFromTokens ? Number(thumbFromTokens) : null);
      setDeckThumbnailCardId(thumbId);

      setCurrentDeckName(selectedDeck.name);
      setDeckName(selectedDeck.name);
      setActiveTab('deck');
    }
  };

  const createNewDeck = () => {
    setDeck([]);
    setTokenDeck({});
    setDeckThumbnailCardId(null);
    setCurrentDeckName('');
    setDeckName('');
    setActiveTab('deck');
  };

  const deleteDeckByName = async (name) => {
    // イベントロックチェック
    const lockedBy = await getLockedEventName(name);
    if (lockedBy) { alert(`デッキ「${name}」はイベント「${lockedBy}」で使用されているため、削除できません。\nイベントページでデッキ登録を解除してから削除してください。`); return; }
    const confirmDelete = window.confirm(`デッキ「${name}」を削除しますか？`);
    if (!confirmDelete) return;
    if (user && !await deleteCloudDeck(user.id, name, deckScope)) return;
    const updatedDecks = savedDecks.filter((deck) => deck.name !== name);
    setSavedDecks(updatedDecks);
    if (name === currentDeckName) {
      setCurrentDeckName('');
      setDeckName('');
      setDeck([]);
      setTokenDeck({});
      setDeckThumbnailCardId(null);
    }
    alert(`デッキ「${name}」を削除しました！`);
    if (updatedDecks.length > 0) {
      setActiveTab('saved');
    } else {
      setActiveTab('deck');
    }
  };

  // グリッド1セルの高さ（react-window用）
  const CARD_GRID_HEIGHT = 160; // 例: 160px 固定（必要に応じて調整）

  // react-window用: カードリスト1行


  // react-window用: グリッド1セル


  // 横長ではカード表示領域を測定し、縦長では従来の寸法を維持する。
  const searchCardsRef = useRef(null);
  const deckCardsRef = useRef(null);
  const [isLandscape, setIsLandscape] = useState(() => window.matchMedia('(orientation: landscape)').matches);
  const [gridScrollbarWidth, setGridScrollbarWidth] = useState(0);
  const [listSize, setListSize] = useState({ width: Math.max(window.innerWidth, 320), height: 600 });
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:100px;height:100px;overflow:scroll;';
    document.body.appendChild(probe);
    setGridScrollbarWidth(probe.offsetWidth - probe.clientWidth);
    probe.remove();
  }, []);
  useEffect(() => {
    const pane = activeTab === 'deck' ? deckCardsRef.current : searchCardsRef.current;
    const measure = () => {
      const landscape = window.matchMedia('(orientation: landscape)').matches;
      setIsLandscape(landscape);
      const width = landscape && pane?.clientWidth ? pane.clientWidth : Math.max(window.innerWidth, 320);
      const height = landscape && pane?.clientHeight ? pane.clientHeight : 600;
      setListSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    const observer = new ResizeObserver(measure);
    if (pane) observer.observe(pane);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [activeTab]);

  const touchStart = useRef({ x: null, y: null });
  const touchEnd = useRef({ x: null, y: null });

  // スワイプ判定用共通関数
  const useSwipeTab = (containerRef) => {
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      el.style.touchAction = 'pan-y';
      const handleTouchStart = e => {
        const t = e.touches[0];
        touchStart.current = { x: t.clientX, y: t.clientY };
      };
      const handleTouchEnd = e => {
        if (touchStart.current.x === null || touchStart.current.y === null) return;
        const t = e.changedTouches[0];
        touchEnd.current = { x: t.clientX, y: t.clientY };
        const dx = touchEnd.current.x - touchStart.current.x;
        const dy = touchEnd.current.y - touchStart.current.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          const idx = tabOrder.indexOf(activeTab);
          if (dx < 0 && idx < tabOrder.length - 1) setActiveTab(tabOrder[idx + 1]);
          else if (dx > 0 && idx > 0) setActiveTab(tabOrder[idx - 1]);
        }
        touchStart.current = { x: null, y: null };
        touchEnd.current = { x: null, y: null };
      };
      el.addEventListener('touchstart', handleTouchStart, { passive: true });
      el.addEventListener('touchend', handleTouchEnd, { passive: true });
      return () => {
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchend', handleTouchEnd);
      };
    }, [activeTab, tabOrder]);
  };
  useSwipeTab(listContainerRef);
  useSwipeTab(deckContainerRef);
  useSwipeTab(savedContainerRef);
  useSwipeTab(qaContainerRef);
  useSwipeTab(homeContainerRef);
  useSwipeTab(searchContainerRef);

  // react-windowラッパーにtouch-action: pan-yを明示（JSでstyle付与）
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    el.style.touchAction = 'pan-y';
    // react-window内部のスクロールラッパーにも適用
    const inner = el.querySelector('.ReactVirtualized__Grid, .ReactVirtualized__List');
    if (inner) inner.style.touchAction = 'pan-y';
  }, [viewMode, listSize]);

  // ネイティブtouchイベントでスワイプ判定
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const handleTouchStart = e => {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    };
    const handleTouchEnd = e => {
      if (touchStart.current.x === null || touchStart.current.y === null) return;
      const t = e.changedTouches[0];
      touchEnd.current = { x: t.clientX, y: t.clientY };
      const dx = touchEnd.current.x - touchStart.current.x;
      const dy = touchEnd.current.y - touchStart.current.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        const idx = tabOrder.indexOf(activeTab);
        if (dx < 0 && idx < tabOrder.length - 1) setActiveTab(tabOrder[idx + 1]);
        else if (dx > 0 && idx > 0) setActiveTab(tabOrder[idx - 1]);
      }
      touchStart.current = { x: null, y: null };
      touchEnd.current = { x: null, y: null };
    };
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [activeTab, tabOrder]);

  // アイテムにもtouchイベント
  const itemTouchHandlers = useMemo(() => ({
    onTouchStart: e => {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: e => {
      if (touchStart.current.x === null || touchStart.current.y === null) return;
      const t = e.changedTouches[0];
      touchEnd.current = { x: t.clientX, y: t.clientY };
      const dx = touchEnd.current.x - touchStart.current.x;
      const dy = touchEnd.current.y - touchStart.current.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        const idx = tabOrder.indexOf(activeTab);
        if (dx < 0 && idx < tabOrder.length - 1) setActiveTab(tabOrder[idx + 1]);
        else if (dx > 0 && idx > 0) setActiveTab(tabOrder[idx - 1]);
      }
      touchStart.current = { x: null, y: null };
      touchEnd.current = { x: null, y: null };
    }
  }), [activeTab, setActiveTab, tabOrder, touchEnd, touchStart]);

  // グリッド用カラム数・カラム幅・高さ（カード画像サイズに合わせる）
  const gridColumns = isLandscape ? 5 : 4;
  const gridColWidth = Math.max(Math.floor((listSize.width - (isLandscape ? gridScrollbarWidth : 0)) / gridColumns), 1);
  // カード画像のアスペクト比3:4、幅はグリッド幅の92%を画像に使う
  const gridImgWidth = Math.floor(gridColWidth * 0.92);
  const gridImgHeight = Math.floor(gridImgWidth * 561 / 385);
  // セルの高さは画像サイズ＋余白（上下4%ずつ）
  const gridRowHeight = Math.floor(gridImgHeight / 0.92);

  // カード詳細モーダル
  // function CardDetailModal({ card, show, onClose, onSetDeckThumbnail, inDeck, countInDeck, onIncrease, onDecrease }) {
  //   if (!show || !card) return null;
  //   // ダブルフェイス対応
  //   const [showFront, setShowFront] = React.useState(true);
  //   const isDoubleSided = card.isDoubleSided && card.front && card.back;
  //   const activeSide = isDoubleSided ? (showFront ? card.front : card.back) : card;
  //   const maxCount = card.maxDeckCount ?? 3;
  //   return (
  //     <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
  //       <div style={{ background: '#fff', padding: '1.2em 1em 1em 1em', borderRadius: 14, maxWidth: 420, width: '95vw', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
  //         <button className="card-detail-close-btn" onClick={onClose} style={{ position: 'absolute', top: 8, right: 12 }}>×</button>
  //         <div style={{ textAlign: 'center' }}>
  //           <img src={activeSide.image} alt={activeSide.name} style={{ width: '100%', maxWidth: 260, height: 'auto', objectFit: 'cover', borderRadius: 10, marginBottom: '0.7em' }} />
  //         </div>
  //         {isDoubleSided && (
  //           <button style={{ display: 'block', margin: '0 auto 1em auto', padding: '0.3em 1.2em', border: '1px solid #1976d2', background: '#fff', color: '#1976d2', borderRadius: 6, cursor: 'pointer' }} onClick={() => setShowFront(f => !f)}>
  //             {showFront ? '裏面を見る' : '表面に戻す'}
  //           </button>
  //         )}
  //         <div style={{ minHeight: '2.5em', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1em' }}>
  //           {/* デッキ画像に指定ボタンのスペースを常に確保 */}
  //           {onSetDeckThumbnail && inDeck && (card.maxDeckCount ?? 3) > 0 && !card.isBanned ? (
  //             <button style={{ display: 'block', margin: '0 auto', padding: '0.3em 1.2em', border: '1px solid #388e3c', background: '#fff', color: '#388e3c', borderRadius: 6, cursor: 'pointer' }} onClick={() => { onSetDeckThumbnail(card.id); onClose(); }}>
  //               デッキ画像に指定
  //             </button>
  //           ) : (
  //             <span style={{ display: 'inline-block', width: '8.5em', height: '2.2em' }}></span>
  //           )}
  //         </div>
  //         <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.7em', marginBottom: '1em' }}>
  //           {maxCount > 0 ? (
  //             <>
  //               <button onClick={() => onDecrease(card.id)} style={{ width: '2.2em', height: '2.2em', borderRadius: '50%', background: '#1976d2', color: '#fff', fontSize: '1.3em', border: 'none' }}>-</button>
  //               <span style={{ fontSize: '1.1em' }}>{countInDeck} / {maxCount}</span>
  //               <button onClick={() => onIncrease(card.id)} style={{ width: '2.2em', height: '2.2em', borderRadius: '50%', background: '#1976d2', color: '#fff', fontSize: '1.3em', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, textAlign: 'center' }}>+</button>
  //             </>
  //           ) : (
  //             <span style={{ color: '#d32f2f', fontWeight: 'bold', fontSize: '1.0em' }}>このカードはデッキに入れられません。</span>
  //           )}
  //         </div>
  //         <h2 style={{ fontSize: '1.3em', fontWeight: 'bold', marginBottom: '0.5em' }}>{activeSide.name}</h2>
  //         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7em 1.2em', fontSize: '0.97em', color: '#555', marginBottom: '0.7em' }}>
  //           <span>属性: {(activeSide.color||[]).join('・') || '-'}</span>
  //           <span>コスト: {activeSide.cost}</span>
  //           <span>{activeSide.reduction && activeSide.reduction.length ? `軽減: ${activeSide.reduction.join('・')}` : ''}</span>
  //           <span>カード種類: {activeSide.type}</span>
  //           <span>系統: {activeSide.tribe||'-'}</span>
  //         </div>
  //         {activeSide.levels && (
  //           <div style={{ marginBottom: '0.7em', overflowX: 'auto' }}>
  //             <table style={{ width: '100%', fontSize: '0.97em', borderCollapse: 'collapse' }}>
  //               <thead>
  //                 <tr>
  //                   <th style={{ border: '1px solid #ddd', padding: '2px 6px', background: '#f5f5f5' }}></th>
  //                   {activeSide.levels.map(l => (
  //                     <th key={l.level} style={{ border: '1px solid #ddd', padding: '2px 6px', background: '#f5f5f5' }}>{l.level} ({l.cost})</th>
  //                   ))}
  //                   {card.ocBoost && (
  //                     <th style={{ border: '1px solid #ddd', padding: '2px 6px', background: '#f5f5f5', color: '#d32f2f', fontWeight: 'bold' }}>OC({card.ocBoost.levelLabel.replace('OC','')})</th>
  //                   )}
  //                   {(['ブレイヴ', '契約ブレイヴ'].includes(activeSide.type)) && activeSide.combinedBoost && (
  //                     <th style={{ border: '1px solid #ddd', padding: '2px 6px', background: '#f5f5f5',color: '#1976d2', fontWeight: 'bold' }}>合体中</th>
  //                   )}
  //                 </tr>
  //               </thead>
  //               <tbody>
  //                 <tr>
  //                   <td style={{ border: '1px solid #ddd', padding: '2px 6px', background: '#f5f5f5' }}>BP</td>
  //                   {activeSide.levels.map(l => ([
  //                     'スピリット', 'アルティメット', 'ブレイヴ', '契約スピリット', '契約ブレイヴ'
  //                   ].includes(activeSide.type) ? (
  //                     <td key={l.level} style={{ border: '1px solid #ddd', padding: '2px 6px' }}>{l.bp ?? '-'}</td>
  //                   ) : (
  //                     <td key={l.level} style={{ border: '1px solid #ddd', padding: '2px 6px' }}>-</td>
  //                   )))}
  //                   {card.ocBoost && (
  //                     <td style={{ border: '1px solid #ddd', padding: '2px 6px', color: '#d32f2f', fontWeight: 'bold' }}>{card.ocBoost.bp}</td>
  //                   )}
  //                   {(['ブレイヴ', '契約ブレイヴ'].includes(activeSide.type)) && activeSide.combinedBoost && (
  //                     <td style={{ border: '1px solid #ddd', padding: '2px 6px', color: '#1976d2', fontWeight: 'bold' }}>+{activeSide.combinedBoost}</td>
  //                   )}
  //                 </tr>
  //               </tbody>
  //             </table>
  //           </div>
  //         )}
  //         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7em 1.2em', fontSize: '0.97em', color: '#555', marginBottom: '0.7em' }}>
  //           <span>レアリティ: {activeSide.rarity||'-'}</span>
  //           <span>収録弾: {activeSide.pack||'-'}</span>
  //           <span>カード番号: {activeSide.cardNumber||'-'}</span>
  //         </div>
  //         <div style={{ fontSize: '0.98em', color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{activeSide.effect||''}</div>
  //       </div>
  //     </div>
  //   );
  // }

  // カード詳細モーダル表示用state
  const [detailCard, setDetailCard] = useState(null);
  const [detailHideDeckActions, setDetailHideDeckActions] = useState(false);

  // カード詳細を開く
  const openCardDetail = React.useCallback((card, opts = {}) => {
    setDetailCard(card);
    setDetailHideDeckActions(!!opts.hideDeckActions);
    setShowFront(true); // 新しく開くたびに表面にリセット
  }, [setDetailCard, setDetailHideDeckActions, setShowFront]);
  // カード詳細を閉じる
  const closeCardDetail = () => {
    setDetailCard(null);
    setDetailHideDeckActions(false);
  };

  // スクロール位置保存用
  const searchListScrollRef = useRef(0);

  // 検索タブのリスト/グリッドのスクロール位置を保存
  useEffect(() => {
    if (activeTab !== 'search') {
      // タブを離れるときに現在のスクロール位置を保存
      const el = listContainerRef.current;
      if (el) {
        searchListScrollRef.current = el.scrollTop;
      }
    }
  }, [activeTab]);

  // 検索タブに戻ったときにスクロール位置を復元
  useEffect(() => {
    if (activeTab === 'search') {
      const el = listContainerRef.current;
      if (el) {
        setTimeout(() => {
          el.scrollTop = searchListScrollRef.current;
        }, 0);
      }
    }
  }, [activeTab, viewMode, listSize.width, listSize.height]);

  // デッキ詳細ウィンドウ用state
  const [detailDeck, setDetailDeck] = useState(null);
  const [detailDeckViewMode, setDetailDeckViewMode] = useState('grid');

  // デッキをA4・3x3グリッドでPDF出力する関数
  // PDF出力: 1ページごとにファイル分割・デッキ名-順番_総数.pdf・ダブルフェイス対応
  async function exportDeckToA4PDF(deck) {
    const { default: jsPDF } = await import('jspdf');
    if (!deck) {
      alert('デッキにカードがありません');
      return;
    }
    const mainCards = Array.isArray(deck.cards) ? deck.cards : [];
    const pageWidth = 210;
    const pageHeight = 297;
    const cellW = 60; // mm
    const cellH = 87; // mm
    const gridCols = 3;
    const gridRows = 3;
    const totalGridW = cellW * gridCols;
    const totalGridH = cellH * gridRows;
    const marginX = (pageWidth - totalGridW) / 2;
    const marginY = (pageHeight - totalGridH) / 2;

    // デッキの合計枚数を計算（トークン含む）
    // 現行仕様: tokenDeckの枚数を反映し、0枚のトークンは「無し」扱い
    // 旧型: tokenDeckフィールドが無い場合のみ、関連トークンを9枚として扱う
    const hasTokenDeckField = deck && Object.prototype.hasOwnProperty.call(deck, 'tokenDeck');
    const tokenCountMap = new Map();
    if (Array.isArray(deck.tokenDeck)) {
      for (const t of deck.tokenDeck) {
        if (!t || typeof t.id === 'undefined') continue;
        const cnt = Number(t.count) || 0;
        if (cnt > 0) tokenCountMap.set(Number(t.id), cnt);
      }
    } else if (deck.tokenDeck && typeof deck.tokenDeck === 'object') {
      for (const [id, cntRaw] of Object.entries(deck.tokenDeck)) {
        const cnt = Number(cntRaw) || 0;
        if (cnt > 0) tokenCountMap.set(Number(id), cnt);
      }
    }

    const relatedTokensAll = Array.isArray(deck.relatedTokens) ? deck.relatedTokens : [];
    const relatedIdSet = new Set(relatedTokensAll.map(t => Number(t.id)));
    const extraTokenIds = hasTokenDeckField
      ? Array.from(tokenCountMap.keys()).filter(id => !relatedIdSet.has(Number(id)))
      : [];
    const extraTokenCards = extraTokenIds
      .map(id => cardData.find(c => Number(c.id) === Number(id)))
      .filter(Boolean);

    const tokenCards = [...relatedTokensAll, ...extraTokenCards]
      .map(tc => {
        const id = Number(tc.id);
        const fromMap = tokenCountMap.get(id);
        const legacyDefault = !hasTokenDeckField
          ? Math.min(9, tc.maxTokenDeckCount ?? 9)
          : 0;
        const count = (typeof fromMap === 'number') ? fromMap : legacyDefault;
        return { card: tc, count };
      })
      .filter(x => (Number(x.count) || 0) > 0);

    const mainTotal = mainCards.reduce((sum, c) => sum + (c.count || 0), 0);
    const tokenTotal = tokenCards.reduce((sum, t) => sum + (Number(t.count) || 0), 0);

    // メイン0枚・トークン0枚なら出力不可
    if (mainTotal <= 0 && tokenTotal <= 0) {
      alert('デッキにカードがありません');
      return;
    }

    let totalDeckCount = 0;
    for (const card of mainCards) {
      totalDeckCount += card.count || 1;
    }
    for (const t of tokenCards) {
      totalDeckCount += Number(t.count) || 0;
    }

    // ① ② ③ ページごとの画像リストを作成
    let cardImages = [];
    for (const card of mainCards) {
      const isDoubleSided = card.isDoubleSided && card.front && card.back;
      const count = card.count || 1;

      // 18枚以下なら実際の枚数分、19枚以上なら3枚ごとに1つの画像
      const repeat = totalDeckCount <= 18 ? count : Math.ceil(count / 3);

      for (let i = 0; i < repeat; i++) {
        if (isDoubleSided) {
          cardImages.push(card.front.image);
          cardImages.push(card.back.image);
        } else {
          cardImages.push(card.image);
        }
      }
    }

    // トークンカードを最後に追加（枚数>0のみ、旧型は9枚扱い）
    if (tokenCards.length > 0) {
      for (const { card: tokenCard, count } of tokenCards) {
        const tokenCount = Number(count) || 0;
        const tokenRepeat = totalDeckCount <= 18 ? tokenCount : Math.ceil(tokenCount / 3);
        for (let i = 0; i < tokenRepeat; i++) {
          cardImages.push(tokenCard.image);
        }
      }
    }

    // 画像をbase64化（軽い圧縮処理付き）
    async function fetchImageAsDataUrl(url) {
      let fetchUrl = url;
      if (!/^https?:/.test(url) && !url.startsWith('data:')) {
        fetchUrl = url.startsWith('/') ? url : `/${url}`;
      }
      const res = await fetch(fetchUrl);
      const blob = await res.blob();

      // 軽い圧縮でPDFサイズを10MB未満に抑える（印刷品質重視）
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          // リサイズ: 最大幅800px（印刷品質を保持）
          const maxWidth = 800;
          const scale = Math.min(1, maxWidth / img.width);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // JPEG品質99%で軽い圧縮（印刷品質重視）
          resolve(canvas.toDataURL('image/jpeg', 0.99));
        };
        img.onerror = reject;

        const reader = new FileReader();
        reader.onloadend = () => {
          img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    const dataUrls = [];
    for (let i = 0; i < cardImages.length; i++) {
      try {
        dataUrls.push(await fetchImageAsDataUrl(cardImages[i]));
      } catch {
        dataUrls.push(null);
      }
    }

    // 1ページごとにファイルを分割
    const totalPages = Math.ceil(dataUrls.length / (gridCols * gridRows));
    const iOSMode = isIOSDevice();
    const outFiles = [];
    for (let page = 0; page < totalPages; page++) {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // ヘッダー（グリッドより上に配置）
      try {
        doc.setFontSize(10);
        doc.text(`メインデッキ${mainTotal}枚 トークンデッキ${tokenTotal}枚`, marginX, 10);
      } catch {
        // text描画失敗時は無視
      }

      for (let i = 0; i < gridCols * gridRows; i++) {
        const idx = page * gridCols * gridRows + i;
        if (idx >= dataUrls.length) break;
        const col = i % gridCols;
        const row = Math.floor(i / gridCols);
        const x = marginX + col * cellW;
        const y = marginY + row * cellH;
        const imgData = dataUrls[idx];
        if (imgData) {
          doc.addImage(imgData, 'JPEG', x, y, cellW, cellH);
        }
      }
      // ファイル名: デッキ名-ページ番号_総ページ数.pdf
      const fileName = `${deck.name.replace(/[\\/:*?"<>|]/g, '_')}-${page + 1}_${totalPages}.pdf`;

      if (iOSMode) {
        try {
          const blob = doc.output('blob');
          const url = URL.createObjectURL(blob);
          outFiles.push({ name: fileName, url });
        } catch {
          // iOS用生成に失敗した場合は何もしない（あとで0件表示）
        }
      } else {
        doc.save(fileName);
      }
    }

    if (iOSMode) {
      openExportFilesModal('PDF出力（開く）', outFiles);
    } else {
      alert('デッキをPDF出力しました');
    }
  }

  // デッキ詳細画面でデッキをJSONでエクスポート
  const exportSingleDeckAsJson = (deck) => {
    const dataStr = JSON.stringify(deck, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.name || "deck"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // sortDeckCards は ./utils/deckUtils.js から import 済み

  // savedDecksが変化したらlocalStorageへ保存（アラートは削除）
  useEffect(() => {
    try {
      if (!userId) localStorage.setItem('savedCanvasDecks', JSON.stringify(savedDecks));
      console.log('savedCanvasDecks updated:', savedDecks);
    } catch (e) {
      alert('デッキの保存に失敗しました（localStorage容量制限など）');
      console.error(e);
    }
  }, [savedDecks, userId]);

  // --- 既存保存データの自動移行（最小形式へ） ---
  useEffect(() => {
    if (!Array.isArray(savedDecks) || savedDecks.length === 0) return;
    const migrated = savedDecks.map(d => {
      const cards = Array.isArray(d.cards) ? d.cards : [];
      // 旧形式判定: カードに name/type/image 等のプロパティが含まれている
      const needsMigrate = cards.some(c => c && (c.name || c.type || c.image || c.front || c.back));
      const hasTokenDeckField = d && Object.prototype.hasOwnProperty.call(d, 'tokenDeck');
      let tokenDeck;
      if (Array.isArray(d.tokenDeck)) {
        tokenDeck = d.tokenDeck
          .map(t => ({ id: Number(t?.id), count: Number(t?.count) || 0 }))
          .filter(t => Number.isFinite(t.id) && t.id > 0 && t.count > 0);
      } else if (d.tokenDeck && typeof d.tokenDeck === 'object') {
        tokenDeck = Object.entries(d.tokenDeck)
          .map(([id, count]) => ({ id: Number(id), count: Number(count) || 0 }))
          .filter(t => Number.isFinite(t.id) && t.id > 0 && t.count > 0);
      } else {
        // tokenDeckフィールドが無いデッキは「旧型」として判別できるよう、あえて付与しない
        tokenDeck = hasTokenDeckField ? [] : undefined;
      }
      if (!needsMigrate) {
        // 余計なトップレベルフィールドを落とす（thumbnail/relatedTokens など）
        const base = { _cloudId: d._cloudId, createdAt: d.createdAt, updatedAt: d.updatedAt, thumbnailCardId: d.thumbnailCardId, name: d.name, cards: cards.map(c => ({ id: c.id, count: c.count || 0, isDeckThumbnail: !!c.isDeckThumbnail })) };
        if (typeof tokenDeck !== 'undefined') base.tokenDeck = tokenDeck;
        return base;
      }
      // 最小形式へ変換
      const minimalCards = cards.map(c => ({ id: c.id, count: c.count || 0, isDeckThumbnail: !!c.isDeckThumbnail }));
      const base = { _cloudId: d._cloudId, createdAt: d.createdAt, updatedAt: d.updatedAt, thumbnailCardId: d.thumbnailCardId, name: d.name, cards: minimalCards };
      if (typeof tokenDeck !== 'undefined') base.tokenDeck = tokenDeck;
      return base;
    });
    // 変更があれば反映
    const changed = JSON.stringify(migrated) !== JSON.stringify(savedDecks.map(d => ({ _cloudId: d._cloudId, createdAt: d.createdAt, updatedAt: d.updatedAt, thumbnailCardId: d.thumbnailCardId, name: d.name, cards: d.cards, tokenDeck: d.tokenDeck })));
    if (changed) setSavedDecks(migrated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- デッキURL共有用 ---
  // id/count ペアを URL クエリ文字列にエンコード（id:2byte, count:1byte）
  function encodeIdCountPairsToQuery(pairs) {
    const arr = (pairs || [])
      .map(([id, count]) => [Number(id), Number(count)])
      .filter(([id, count]) => Number.isFinite(id) && Number.isFinite(count) && id > 0 && count > 0);
    const buf = new Uint8Array(arr.length * 3);
    arr.forEach(([id, count], i) => {
      buf[i * 3] = (id >> 8) & 0xff;
      buf[i * 3 + 1] = id & 0xff;
      buf[i * 3 + 2] = count & 0xff;
    });
    let binary = '';
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    // base64（URLセーフ: +→-, /→_, =削除）
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeIdCountPairsFromQuery(str) {
    try {
      if (!str) return [];
      str = String(str).replace(/-/g, '+').replace(/_/g, '/');
      while (str.length % 4) str += '=';
      const binary = atob(str);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      const arr = [];
      for (let i = 0; i + 2 < buf.length; i += 3) {
        const id = (buf[i] << 8) | buf[i + 1];
        const count = buf[i + 2];
        if (id > 0 && count > 0) arr.push([id, count]);
      }
      return arr;
    } catch (e) {
      console.error('クエリデコード失敗', e);
      return [];
    }
  }

  // デッキをURLクエリにエンコード
  function encodeDeckToQuery(deck) {
    return encodeIdCountPairsToQuery((deck || []).map(c => [Number(c.id), Number(c.count)]));
  }
  // URLクエリからデッキをデコード
  function decodeDeckFromQuery(str) {
    const arr = decodeIdCountPairsFromQuery(str);
    const cards = arr
      .map(([id, count]) => {
        const card = cardData.find(c => Number(c.id) === id);
        return card ? { ...card, count } : null;
      })
      .filter(Boolean);
    return cards.length ? cards : null;
  }

  // --- URLクエリからデッキ自動読込 ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deckParam = params.get('deck');
    const tokenParam = params.get('token');
    if (deckParam) {
      const loaded = decodeDeckFromQuery(deckParam);
      if (loaded && loaded.length > 0) {
        setDeck(loaded);
        if (tokenParam) {
          const tokenPairs = decodeIdCountPairsFromQuery(tokenParam);
          const map = {};
          for (const [id, count] of tokenPairs) map[id] = count;
          setTokenDeck(map);
        } else {
          // 旧共有URL（tokenパラメータ無し）は関連トークンを9枚として初期化
          const legacyTokenCards = collectRelatedTokensFromCards(loaded);
          const map = {};
          for (const t of legacyTokenCards) {
            const maxT = t.maxTokenDeckCount ?? 9;
            const cnt = Math.min(9, maxT);
            if (cnt > 0) map[Number(t.id)] = cnt;
          }
          setTokenDeck(map);
        }
        setActiveTab('deck');
        setCurrentDeckName('共有デッキ');
        setDeckName('共有デッキ');
      }
    }
  }, [window.location.search]);

  // --- デッキ共有用URL生成 ---
  const getShareUrl = () => {
    const encoded = encodeDeckToQuery(deck);
    const tokenPairs = Object.entries(tokenDeck)
      .map(([id, count]) => [Number(id), Number(count)])
      .filter(([, count]) => count > 0);
    const tokenEncoded = tokenPairs.length ? encodeIdCountPairsToQuery(tokenPairs) : '';
    // 共有URLは必ずindex.htmlを明示
    const tokenPart = tokenEncoded ? `&token=${tokenEncoded}` : '';
    return `${window.location.origin}/index.html?deck=${encoded}${tokenPart}`;
  };

  // --- SVG生成（共通）---
  const buildDeckSVG = async (deckObj) => {
    if (!deckObj || !Array.isArray(deckObj.cards)) return null;
    const cards = sortDeckCards(deckObj.cards);
    // 画像を dataURL に変換するヘルパー（同一オリジン前提）
    const toDataUrl = async (src) => {
      if (!src) return null;
      try {
        const res = await fetch(src, { cache: 'no-cache' });
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        const reader = new FileReader();
        const done = new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result);
        });
        reader.readAsDataURL(blob);
        return await done; // data:image/png;base64,...
      } catch {
        return null;
      }
    };
    // レイアウト設定
    const cols = 5;
    const cellW = 110; // 1カードの枠幅
    const cellH = 160; // 1カードの枠高（3:4近似）
    const gap = 12;
    const marginLeft = 24;
    const marginTop = 24;
    const headerH = 90;
    const rows = Math.ceil(cards.length / cols);

    // 現行仕様: tokenDeckの枚数を反映し、0枚のトークンは「無し」扱い
    // 旧型: tokenDeckフィールドが無い場合のみ、関連トークンを9枚として扱う
    const hasTokenDeckField = deckObj && Object.prototype.hasOwnProperty.call(deckObj, 'tokenDeck');
    const tokenCountMap = new Map();
    if (Array.isArray(deckObj.tokenDeck)) {
      for (const t of deckObj.tokenDeck) {
        if (!t || typeof t.id === 'undefined') continue;
        const cnt = Number(t.count) || 0;
        if (cnt > 0) tokenCountMap.set(Number(t.id), cnt);
      }
    } else if (deckObj.tokenDeck && typeof deckObj.tokenDeck === 'object') {
      for (const [id, cntRaw] of Object.entries(deckObj.tokenDeck)) {
        const cnt = Number(cntRaw) || 0;
        if (cnt > 0) tokenCountMap.set(Number(id), cnt);
      }
    }

    const relatedTokensAll = Array.isArray(deckObj.relatedTokens) ? deckObj.relatedTokens : [];
    const relatedIdSet = new Set(relatedTokensAll.map(t => Number(t.id)));
    const extraTokenIds = hasTokenDeckField
      ? Array.from(tokenCountMap.keys()).filter(id => !relatedIdSet.has(Number(id)))
      : [];
    const extraTokenCards = extraTokenIds
      .map(id => cardData.find(c => Number(c.id) === Number(id)))
      .filter(Boolean);

    const tokenCards = [...relatedTokensAll, ...extraTokenCards]
      .map(tc => {
        const id = Number(tc.id);
        const fromMap = tokenCountMap.get(id);
        const legacyDefault = !hasTokenDeckField
          ? Math.min(9, tc.maxTokenDeckCount ?? 9)
          : 0;
        const count = (typeof fromMap === 'number') ? fromMap : legacyDefault;
        return { card: tc, count };
      })
      .filter(x => (Number(x.count) || 0) > 0);

    const tokenRows = Math.ceil(tokenCards.length / cols);
    const svgW = marginLeft + cols * cellW + (cols - 1) * gap + marginLeft;
    const extraBetween = tokenCards.length > 0 ? 40 : 0;
    const svgH = marginTop + headerH
      + rows * cellH + (rows - 1) * gap
      + (tokenCards.length > 0 ? (extraBetween + tokenRows * cellH + Math.max(0, tokenRows - 1) * gap) : 0)
      + marginTop;

    // ヘッダー（タイトル、サムネイル、合計枚数）
    const header = (() => {
      const nameText = deckObj.name || 'デッキ';
      const mainTotal = cards.reduce((s, c) => s + (c.count || 0), 0);
      const tokenTotal = tokenCards.reduce((s, t) => s + (Number(t.count) || 0), 0);
      const thumbSrc = deckObj.thumbnail || (cards[0] ? (cards[0].isDoubleSided && cards[0].front ? cards[0].front.image : cards[0].image) : null);
      // 同期文字列生成のため、後で置換
      const thumbImgPlaceholder = '<!--THUMB_PLACEHOLDER-->';
      const titleX = marginLeft + (thumbSrc ? 64 : 0);
      return `
        ${thumbImgPlaceholder}
        <text x="${titleX}" y="${marginTop + 26}" font-size="22" font-weight="700" fill="#000">${nameText}</text>
        <text x="${titleX}" y="${marginTop + 56}" font-size="16" font-weight="700">
          <tspan fill="#1976d2">メインデッキ${mainTotal}枚</tspan>
          ${tokenTotal > 0 ? `<tspan fill="#1976d2"> </tspan><tspan fill="#ff9800">トークンデッキ${tokenTotal}枚</tspan>` : ''}
        </text>
      `;
    })();

    // カードグリッドSVG作成
    const gridStartY = marginTop + headerH;
    // 後で画像を埋め込むためにプレースホルダーを使う
    const imgPlaceholders = [];
    const items = cards.map((card, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const x = marginLeft + c * (cellW + gap);
      const y = gridStartY + r * (cellH + gap);
      const display = card.isDoubleSided && card.front ? card.front : card;
      const imgX = x + 4;
      const imgY = y + 4;
      const imgW = cellW - 8;
      const imgH = cellH - 8;
      const placeholderId = `IMG_${idx}`;
      imgPlaceholders.push({ id: placeholderId, src: display.image, x: imgX, y: imgY, w: imgW, h: imgH });
      // バッジ（右上）
      const badgeR = 12;
      const badgeCx = x + cellW - badgeR - 6;
      const badgeCy = y + badgeR + 6;
      return `
        <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="6" ry="6" fill="#ffffff" stroke="#bbb" />
        <!--${placeholderId}-->
        <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="#1976d2" />
        <text x="${badgeCx}" y="${badgeCy + 5}" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${card.count || 0}</text>
      `;
    }).join('');

    // トークンデッキセクション
    let tokensSection = '';
    if (tokenCards.length > 0) {
      const tokenStartY = gridStartY + rows * (cellH + gap) + extraBetween;
      const tokenItems = tokenCards.map(({ card: tokenCard, count }, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const x = marginLeft + c * (cellW + gap);
        const y = tokenStartY + r * (cellH + gap);
        const display = tokenCard;
        const imgX = x + 4;
        const imgY = y + 4;
        const imgW = cellW - 8;
        const imgH = cellH - 8;
        const placeholderId = `TOKEN_IMG_${idx}`;
        imgPlaceholders.push({ id: placeholderId, src: display.image, x: imgX, y: imgY, w: imgW, h: imgH });
        const badgeR = 12;
        const badgeCx = x + cellW - badgeR - 6;
        const badgeCy = y + badgeR + 6;
        const badgeCount = Number(count) || 0;
        return `
          <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="6" ry="6" fill="#ffffff" stroke="#bbb" />
          <!--${placeholderId}-->
          <circle cx="${badgeCx}" cy="${badgeCy}" r="${badgeR}" fill="#ff9800" />
          <text x="${badgeCx}" y="${badgeCy + 5}" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${badgeCount}</text>
        `;
      }).join('');
      const tokenHeader = `<text x="${marginLeft}" y="${tokenStartY - 12}" font-size="18" font-weight="700" fill="#ff9800">トークンデッキ</text>`;
      tokensSection = `${tokenHeader}${tokenItems}`;
    }

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
        <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#ffffff" />
        ${header}
        ${items}
        ${tokensSection}
      </svg>`;

    // サムネイル差し込み
    const headerThumbSrc = deckObj.thumbnail || (cards[0] ? (cards[0].isDoubleSided && cards[0].front ? cards[0].front.image : cards[0].image) : null);
    if (headerThumbSrc) {
      const thumbDataUrl = await toDataUrl(headerThumbSrc);
      if (thumbDataUrl) {
        const thumbTag = `<image href="${thumbDataUrl}" x="${marginLeft}" y="${marginTop}" width="48" height="64" />`;
        svg = svg.replace('<!--THUMB_PLACEHOLDER-->', thumbTag);
      } else {
        svg = svg.replace('<!--THUMB_PLACEHOLDER-->', '');
      }
    } else {
      svg = svg.replace('<!--THUMB_PLACEHOLDER-->', '');
    }

    // 各カード画像差し込み
    for (const ph of imgPlaceholders) {
      const dataUrl = await toDataUrl(ph.src);
      const tag = dataUrl
        ? `<image href="${dataUrl}" x="${ph.x}" y="${ph.y}" width="${ph.w}" height="${ph.h}" preserveAspectRatio="xMidYMid slice" />`
        : '';
      svg = svg.replace(`<!--${ph.id}-->`, tag);
    }

    return { svg, width: svgW, height: svgH };
  };

  // --- SVGエクスポート（ダウンロード）---
  const exportDeckAsSVG = async (deckObj) => {
    const built = await buildDeckSVG(deckObj);
    if (!built) return;
    const blob = new Blob([built.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckObj.name || 'deck'}-detail.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- SVG→PNG 変換してダウンロード ---
  const exportDeckSvgToPng = async (deckObj, opts = {}) => {
    const built = await buildDeckSVG(deckObj);
    if (!built) return;
    const { svg, width, height } = built;
    // 高解像度化用スケール。指定がなければデバイスのDPRか2倍を採用。
    const scale = Math.max(4, Math.floor((opts.scale || window.devicePixelRatio || 4)));
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = svgUrl;
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
      });
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      // スケール適用のうえアンチエイリアスを有効化
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const iOSMode = isIOSDevice();
      const fileName = `${deckObj.name || 'deck'}.png`;

      if (iOSMode) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const url = URL.createObjectURL(blob);
          openExportFilesModal('PNG出力（開く）', [{ name: fileName, url }]);
        } else {
          openExportFilesModal('PNG出力（開く）', []);
        }
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  // 安全な幅・高さを保証
  const safeListWidth = (!listSize.width || isNaN(listSize.width) || listSize.width < 80) ? 320 : listSize.width;
  const safeGridColWidth = (!gridColWidth || isNaN(gridColWidth) || gridColWidth < 1) ? 80 : gridColWidth;
  const safeListHeight = (!listSize.height || isNaN(listSize.height) || listSize.height < 1) ? 600 : listSize.height;

  const renderContext = useMemo(() => ({ decreaseCardCount, decreaseTokenCount, getCardCountInDeck, increaseCardCount, increaseTokenCount, itemTouchHandlers, openCardDetail, tokenDeck }), [decreaseCardCount, decreaseTokenCount, getCardCountInDeck, increaseCardCount, increaseTokenCount, itemTouchHandlers, openCardDetail, tokenDeck]);
  const searchItemData = useMemo(() => ({ cards: filteredCards, columns: gridColumns, context: renderContext }), [filteredCards, gridColumns, renderContext]);
  const deckItemData = useMemo(() => ({ cards: sortDeckCards(deck), columns: gridColumns, context: renderContext }), [deck, gridColumns, renderContext]);

  // 画面幅が異常な場合はメッセージ表示
  if (!safeListWidth || isNaN(safeListWidth) || safeListWidth < 80) {
    return <div style={{padding:40}}>画面幅が小さすぎるか、レイアウト計算に失敗しました。ウィンドウを広げてください。</div>;
  }

  const deckFooter = (
            <div className="builder-footer">
            <div className="input-row">
              <input
                id="deckNameInput"
                placeholder="デッキ名"
                type="text"
                value={deckName}
                onChange={e => setDeckName(e.target.value)}
              />
            </div>
            <div className="input-row" style={{ gap: '0.5em' }}>
              <button id="saveDeckBtn" style={{ flex: 1, background: '#388e3c' }} onClick={saveCurrentDeck}>{isLandscape ? '保存' : 'デッキ保存'}</button>
              {/* ▼▼▼ デッキ共有ボタン追加 ▼▼▼ */}
              <button style={{ flex: 1, background: '#1976d2', color: '#fff' }}
                onClick={() => {
                  const url = getShareUrl();
                  window.prompt('このURLをコピーして共有できます', url);
                }}
                disabled={deck.length === 0 && Object.values(tokenDeck).every(v => (Number(v) || 0) <= 0)}
              >{isLandscape ? '共有' : 'デッキ共有URL'}</button>
            </div>
            <button id="clearDeckBtn" style={{ flex: 1, background: '#bbb', color: '#222', marginTop: '0.5em' }} onClick={createNewDeck}>クリア</button>
            <div id="message"></div>
            </div>
  );

  return (
    <div className={`container${activeTab !== 'home' ? ' workspace-active' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h1 style={{ margin: 0 }}>　オリカマネージャー　</h1>
        <UserBadge />
      </div>
      {/* タブバー */}
      <div className="tab-bar" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr) minmax(0,2fr) minmax(0,2fr) minmax(0,1fr)', gap: '6px', overflowX: 'hidden' }}>
        <button className={`tab-btn${activeTab === 'home' ? ' active' : ''}`} style={{ minWidth: 0, fontSize: '1em', fontWeight: 'bold', lineHeight: 1 }} onClick={() => setActiveTab('home')}>🏠</button>
        <button className={`tab-btn${activeTab === 'search' ? ' active' : ''}`} style={{ minWidth: 0 }} onClick={() => setActiveTab('search')}>カード検索</button>
        <button className={`tab-btn${activeTab === 'deck' ? ' active' : ''}`} style={{ minWidth: 0 }} onClick={() => setActiveTab('deck')}>作成中デッキ</button>
        <button className={`tab-btn${activeTab === 'saved' ? ' active' : ''}`} style={{ minWidth: 0 }} onClick={() => setActiveTab('saved')}>保存デッキ</button>
        <button className={`tab-btn${activeTab === 'qa' ? ' active' : ''}`} style={{ minWidth: 0 }} onClick={() => setActiveTab('qa')}>QA</button>
      </div>
      <div
        className="tab-content-wrap"
        ref={tabContentWrapRef}
        style={{ touchAction: 'pan-y' }} // 垂直スクロールは許可
      >
        {/* ホームタブ */}
        <div className="tab-content" ref={homeContainerRef} style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
          <div style={{ marginTop: 8 }}>
            <h2>最新情報</h2>
            {/* 開催予定イベント */}
            <HomeRecruitingEvents />
            {/* エラッタ情報リスト */}
            <HomeErrataList onOpenCard={(card) => openCardDetail(card, { hideDeckActions: true })} />
          </div>
        </div>
        {/* カード検索タブ */}
        <div className="tab-content builder-workspace" ref={searchContainerRef} style={{ display: activeTab === 'search' ? undefined : 'none' }}>
          <div className="builder-controls">
          <div className="input-row">
            <input
              type="text"
              placeholder="カード名、色、効果、作品名で検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button onClick={() => {}} style={{ minWidth: '4em' }}>検索</button>
          </div>
          {/* 検索結果件数表示 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0.5em 0' }}>
            <span style={{ fontWeight: 'bold' }}>検索結果</span>
            <span style={{ color: '#666', fontSize: '0.9em' }}>{filteredCards.length} 件</span>
          </div>
          {/* ▼▼▼ フィルターUI（サンプルHTML準拠） ▼▼▼ */}
          <div style={{ margin: '0.7em 0 0.7em 0' }}>
            <div style={{ display: 'flex', gap: '0.7em', marginBottom: '0.7em' }}>
              <button onClick={() => setShowFilter(f => !f)} style={{ flex: 1 }}>
                {showFilter ? (isLandscape ? '閉じる' : 'フィルターを閉じる') : (isLandscape ? 'フィルター' : 'フィルターを開く')}
              </button>
              <button onClick={resetFilters} style={{ flex: 1, background: '#d32f2f', color: '#fff' }}>{isLandscape ? 'リセット' : '条件リセット'}</button>
            </div>
            {showFilter && (
              <div className="filter-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7em 1em', marginBottom: '1em', fontSize: '0.97em' }}>
                <div>
                  <label>色</label>
                  <select value={filterColor} onChange={e => setFilterColor(e.target.value)} style={{ width: '100%' }}>
                    <option value="">(指定なし)</option>
                    <option value="赤">赤</option>
                    <option value="紫">紫</option>
                    <option value="緑">緑</option>
                    <option value="白">白</option>
                    <option value="黄">黄</option>
                    <option value="青">青</option>
                    <option value="黒">黒</option>
                    <option value="多色">多色</option>
                  </select>
                </div>
                <div>
                  <label>カード種類</label>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: '100%' }}>
                    <option value="">(指定なし)</option>
                    <option value="スピリット">スピリット</option>
                    <option value="アルティメット">アルティメット</option>
                    <option value="ブレイヴ">ブレイヴ</option>
                    <option value="ネクサス">ネクサス</option>
                    <option value="マジック">マジック</option>
                    <option value="契約スピリット">契約スピリット</option>
                    <option value="契約ブレイヴ">契約ブレイヴ</option>
                    <option value="契約ネクサス">契約ネクサス</option>
                    <option value="トークン">トークン</option>
                  </select>
                </div>
                <div>
                  <label>レアリティ</label>
                  <select value={filterRarity} onChange={e => setFilterRarity(e.target.value)} style={{ width: '100%' }}>
                    <option value="">(指定なし)</option>
                    <option value="C">C</option>
                    <option value="R">R</option>
                    <option value="M">M</option>
                    <option value="X">X</option>
                    <option value="XX">XX</option>
                    <option value="TR">TR</option>
                    <option value="TX">TX</option>
                    <option value="CX">CX</option>
                    <option value="T">T</option>
                  </select>
                </div>
                <div>
                  <label>系統</label>
                  <div ref={tribeDropdownRef} style={{ position: 'relative' }}>
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '2fr 1fr' }}>
                      <input
                        type="text"
                        value={filterTribe}
                        onChange={e => setFilterTribe(e.target.value)}
                        onFocus={() => setTribeDropdownOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setTribeDropdownOpen(false);
                          if (e.key === 'ArrowDown') setTribeDropdownOpen(true);
                          if (e.key === 'Enter' && tribeDropdownOpen && filteredTribeOptions.length) {
                            setFilterTribe(filteredTribeOptions[0]);
                            setTribeDropdownOpen(false);
                            e.preventDefault();
                          }
                        }}
                        style={{ width: '100%' }}
                        placeholder="例: 幻想（候補から選択可）"
                        aria-autocomplete="list"
                        aria-expanded={tribeDropdownOpen}
                        aria-controls="tribe-dropdown-list"
                        role="combobox"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setTribeDropdownOpen(prev => {
                            const next = !prev;
                            if (next) {
                              // リストを開く操作時に入力を自動クリア
                              setFilterTribe('');
                            }
                            return next;
                          });
                        }}
                        aria-label="系統候補を開く（開く時に入力をクリア）"
                        title="リストを開く（開く時に系統入力をクリア）"
                        style={{ padding: '4px 8px', width: '100%' }}
                      >
                        ▼
                      </button>
                    </div>
                    {tribeDropdownOpen && (
                      <div
                        id="tribe-dropdown-list"
                        role="listbox"
                        style={{
                          position: 'absolute',
                          zIndex: 50,
                          background: '#fff',
                          border: '1px solid #ccc',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          maxHeight: 240,
                          overflowY: 'auto',
                          WebkitOverflowScrolling: 'touch',
                          touchAction: 'pan-y',
                          overscrollBehavior: 'contain',
                          width: '100%',
                          marginTop: 4,
                        }}
                      >
                        {filteredTribeOptions.length === 0 ? (
                          <div style={{ padding: 8, color: '#666' }}>候補なし</div>
                        ) : (
                          filteredTribeOptions.map(opt => (
                            <div
                              key={opt}
                              role="option"
                              onClick={() => { setFilterTribe(opt); setTribeDropdownOpen(false); }}
                              style={{ padding: '6px 8px', cursor: 'pointer' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              {opt}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label>収録パック</label>
                  <select value={filterPack} onChange={e => setFilterPack(e.target.value)} style={{ width: '100%' }}>
                    <option value="">(指定なし)</option>
                    {PACK_OPTIONS.map(pack => <option key={pack} value={pack}>{getPackLabel(pack)}</option>)}
                  </select>
                </div>
                <div>
                  <label>コスト</label>
                  <select value={filterCost} onChange={e => setFilterCost(e.target.value)} style={{ width: '100%' }}>
                    <option value="">(指定なし)</option>
                    {[...Array(14)].map((_,i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label>軽減シンボル</label>
                  <select value={filterReduction} onChange={e => setFilterReduction(e.target.value)} style={{ width: '100%' }}>
                    <option value="">(指定なし)</option>
                    <option value="赤">赤</option>
                    <option value="紫">紫</option>
                    <option value="緑">緑</option>
                    <option value="白">白</option>
                    <option value="黄">黄</option>
                    <option value="青">青</option>
                    <option value="黒">黒</option>
                    <option value="六">六</option>
                    <option value="七">七</option>
                    <option value="神">神</option>
                    <option value="導">導</option>
                    <option value="極">極</option>
                  </select>
                </div>
                <div>
                  <label>シンボル</label>
                  <select value={filterSymbol} onChange={e => setFilterSymbol(e.target.value)} style={{ width: '100%' }}>
                    <option value="">(指定なし)</option>
                    <option value="赤">赤</option>
                    <option value="紫">紫</option>
                    <option value="緑">緑</option>
                    <option value="白">白</option>
                    <option value="黄">黄</option>
                    <option value="青">青</option>
                    <option value="黒">黒</option>
                    <option value="六">六</option>
                    <option value="七">七</option>
                    <option value="神">神</option>
                    <option value="導">導</option>
                    <option value="極">極</option>
                  </select>
                </div>
              </div>
            )}
          </div>
          {/* ▲▲▲ フィルターUIここまで ▲▲▲ */}
          <div className="view-toggle-row">
            <button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>≡</button>
            <button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}>■</button>
          </div>
          </div>
          <div className="builder-cards" ref={searchCardsRef}>
          {/* カードリスト（リスト/グリッド切替） */}
          {viewMode === 'list' ? (
            <div
              className="card-list"
              ref={listContainerRef}
              style={{ width: '100%', maxWidth: '100vw', touchAction: 'pan-y' }}
            >
              <FixedSizeList
                height={safeListHeight}
                itemCount={filteredCards.length}
                itemData={searchItemData}
                itemSize={80}
                               width={safeListWidth}
              >
                {CardRow}
              </FixedSizeList>
            </div>
          ) : (
            <div
              className="card-grid"
              ref={listContainerRef}
              style={{ width: '100%', maxWidth: '100vw', touchAction: 'pan-y' }}
            >
              <FixedSizeGrid
                height={safeListHeight}
                columnCount={gridColumns}
                columnWidth={safeGridColWidth}
                rowCount={Math.ceil(filteredCards.length / gridColumns)}
                rowHeight={gridRowHeight}
                width={safeListWidth}
                itemData={searchItemData}
              >
                {CardGridCell}
              </FixedSizeGrid>
            </div>
          )}
          </div>
        </div>
        {/* 作成中デッキタブ */}
        <div className="tab-content" style={{ display: activeTab === 'deck' ? 'block' : 'none' }}>
          <div className="builder-workspace builder-workspace-deck" ref={deckContainerRef} style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}>
            <div className="builder-controls">
            <h2>作成中デッキ</h2>
            {/* サムネイル画像表示 */}
            {(() => {
              const tokenTotal = Object.values(tokenDeck).reduce((sum, cnt) => sum + Math.max(0, Number(cnt) || 0), 0);
              const hasAnyCards = deck.length > 0 || tokenTotal > 0;
              if (!hasAnyCards) return null;

              const normalizedThumbId = (() => {
                const id = Number(deckThumbnailCardId);
                if (!Number.isFinite(id)) return null;
                const inMain = deck.some(c => Number(c.id) === id);
                const inTokens = (Number(tokenDeck?.[id]) || 0) > 0;
                return (inMain || inTokens) ? id : null;
              })();

              const thumbIdRaw = normalizedThumbId ?? (deck.find(c => c.isDeckThumbnail)?.id ?? deck[0]?.id ?? null);
              const fallbackTokenId = Object.entries(tokenDeck).find(([, cnt]) => (Number(cnt) || 0) > 0)?.[0];
              const thumbId = thumbIdRaw ?? (fallbackTokenId ? Number(fallbackTokenId) : null);
              const thumbCard = thumbId ? (deck.find(c => Number(c.id) === Number(thumbId)) || cardMapById.get(Number(thumbId))) : null;

              return (
              <div className="builder-deck-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5em' }}>
                {(() => {
                  // サムネイル指定カードを取得
                  if (!thumbCard) return null;
                  const isDoubleSided = thumbCard.isDoubleSided && thumbCard.front && thumbCard.back;
                  const displayCard = isDoubleSided ? thumbCard.front : thumbCard;
                  return (
                    <div style={{
                      border: '3px solid #1976d2',
                      borderRadius: 8,
                      padding: 2,
                      marginRight: '0.7em',
                      width: 48,
                      height: 64,
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#fff',
                    }}>
                      <img src={displayCard.image} alt="デッキサムネイル" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
                    </div>
                  );
                })()}
                {/* 合計枚数表示を追加 */}
                <span style={{ fontWeight: 'bold', fontSize: '1.08em', color: '#1976d2', marginRight: '1em' }}>
                  メインデッキ: {deck.reduce((sum, c) => sum + (c.count || 0), 0)}枚
                </span>
                {tokenTotal > 0 && (
                  <span style={{ fontWeight: 'bold', fontSize: '1.08em', color: '#ff9800', marginRight: '1em' }}>
                    トークンデッキ: {tokenTotal}枚
                  </span>
                )}
                <div className="view-toggle-row" style={{ marginBottom: 0 }}>
                  <button className={`view-toggle-btn${viewMode === 'list' ? ' active' : ''}`} onClick={() => setViewMode('list')}>≡</button>
                  <button className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')}>■</button>
                </div>
              </div>
              );
            })()}
              {isLandscape && deckFooter}
            </div>
            <div className="builder-cards" ref={deckCardsRef}>
            {viewMode === 'list' ? (
              <div
                className="card-list"
                style={{ width: '100%', maxWidth: '100vw', touchAction: 'pan-y' }}
              >
                {(() => {
                  const mainCards = sortDeckCards(deck);
                  // 関連トークンでも、枚数が0なら「トークン無し」扱い（表示しない）
                  const tokenCardsFromDeck = collectRelatedTokensFromCards(deck)
                    .filter(t => (Number(tokenDeck[t.id]) || 0) > 0);
                  const fromDeckIdSet = new Set(tokenCardsFromDeck.map(t => t.id));
                  const extraTokenIds = Object.entries(tokenDeck)
                    .filter(([, cnt]) => (Number(cnt) || 0) > 0)
                    .map(([id]) => Number(id))
                    .filter(id => !fromDeckIdSet.has(id));
                  const extraTokenCards = extraTokenIds
                    .map(id => cardData.find(c => c.id === id))
                    .filter(Boolean);
                  const tokenCards = [...tokenCardsFromDeck, ...extraTokenCards];
                  const tokenTotal = tokenCards.reduce((sum, t) => sum + (Number(tokenDeck[t.id]) || 0), 0);

                  const hasTokens = tokenCards.length > 0;
                  const totalCount = mainCards.length + (hasTokens ? (1 + tokenCards.length) : 0);
                  if (totalCount === 0) return <div>デッキが空です。</div>;

                  return (
                    <FixedSizeList
                      height={Math.min(totalCount * 80, safeListHeight)}
                      itemCount={totalCount}
                      itemSize={80}
                      width={safeListWidth}
                      itemData={{ mainCards, tokenCards, tokenTotal }}
                    >
                      {({ index, style, data }) => {
                        const mainLen = data.mainCards.length;
                        const tokens = data.tokenCards;
                        const hasT = tokens.length > 0;

                        // メイン行
                        if (index < mainLen) {
                          const card = data.mainCards[index];
                          if (!card) return null;
                          const isDoubleSided = card.isDoubleSided && card.front && card.back;
                          const displayCard = isDoubleSided ? card.front : card;
                          const typeText = isDoubleSided ? `${card.front.type} / ${card.back.type}` : card.type;
                          const isToken = isDoubleSided
                            ? (card.front.type?.includes('トークン') || card.back.type?.includes('トークン'))
                            : (card.type?.includes('トークン'));
                          const count = isToken ? (tokenDeck[card.id] || 0) : (card.count || 0);
                          const maxCount = isToken ? (card.maxTokenDeckCount ?? 9) : (card.maxDeckCount ?? 3);

                          return (
                            <div
                              className="card-item"
                              style={{ ...style, touchAction: 'pan-y', cursor: 'pointer' }}
                              {...itemTouchHandlers}
                              onClick={e => {
                                if (
                                  e.target.classList.contains('plusBtn') ||
                                  e.target.classList.contains('minusBtn')
                                ) return;
                                openCardDetail(card);
                              }}
                            >
                              <div className="card-grid-img-wrap" style={{ width: 48, height: 64, marginRight: 8 }}>
                                <img src={displayCard.image} alt={displayCard.name} className="card-grid-img" style={{ width: '100%', height: '100%' }} />
                              </div>
                              <div className="card-info"><b>{card.name}</b> <span style={{ fontSize: '0.9em', color: '#666' }}>({typeText})</span></div>
                              {maxCount > 0 && (
                                <div className="card-controls">
                                  <button
                                    onClick={e => { e.stopPropagation(); isToken ? decreaseTokenCount(card.id) : decreaseCardCount(card.id); }}
                                    className={`minusBtn${isToken ? ' token-btn' : ''}`}
                                    disabled={count <= 0}
                                    style={isToken ? { background: '#ff9800' } : undefined}
                                  >-</button>
                                  <span>{count} / {maxCount}</span>
                                  <button
                                    onClick={e => { e.stopPropagation(); isToken ? increaseTokenCount(card.id) : increaseCardCount(card.id); }}
                                    className={`plusBtn${isToken ? ' token-btn' : ''}`}
                                    disabled={count >= maxCount}
                                    style={isToken ? { background: '#ff9800' } : undefined}
                                  >+</button>
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (!hasT) return null;

                        const headerIndex = mainLen;
                        // トークンヘッダー行
                        if (index === headerIndex) {
                          return (
                            <div
                              style={{ ...style, display: 'flex', alignItems: 'center', fontWeight: 'bold', color: '#ff9800', padding: '0 0.8em' }}
                            >
                              トークンデッキ: {data.tokenTotal || 0}枚
                            </div>
                          );
                        }

                        // トークン行
                        const t = tokens[index - headerIndex - 1];
                        if (!t) return null;
                        const cnt = tokenDeck[t.id] || 0;
                        const maxT = t.maxTokenDeckCount ?? 9;
                        return (
                          <div
                            className="card-item"
                            style={{ ...style, touchAction: 'pan-y', cursor: 'pointer' }}
                            {...itemTouchHandlers}
                            onClick={e => {
                              if (
                                e.target.classList.contains('plusBtn') ||
                                e.target.classList.contains('minusBtn')
                              ) return;
                              openCardDetail(t);
                            }}
                          >
                            <div className="card-grid-img-wrap" style={{ width: 48, height: 64, marginRight: 8 }}>
                              <img src={t.image} alt={t.name} className="card-grid-img" style={{ width: '100%', height: '100%' }} />
                            </div>
                            <div className="card-info"><b>{t.name}</b> <span style={{ fontSize: '0.9em', color: '#666' }}>({t.type})</span></div>
                            <div className="card-controls">
                              <button onClick={e => { e.stopPropagation(); decreaseTokenCount(t.id); }} className="minusBtn token-btn" disabled={cnt <= 0} style={{ background: '#ff9800' }}>-</button>
                              <span>{cnt} / {maxT}</span>
                              <button onClick={e => { e.stopPropagation(); increaseTokenCount(t.id); }} className="plusBtn token-btn" disabled={cnt >= maxT} style={{ background: '#ff9800' }}>+</button>
                            </div>
                          </div>
                        );
                      }}
                    </FixedSizeList>
                  );
                })()}
              </div>
            ) : (
              <div className="card-grid" style={{ width: '100%', maxWidth: '100vw', touchAction: 'pan-y' }}>
                {(() => {
                  const tokenTotal = Object.values(tokenDeck).reduce((sum, cnt) => sum + Math.max(0, Number(cnt) || 0), 0);
                  const hasAnyCards = deck.length > 0 || tokenTotal > 0;
                  if (!hasAnyCards) return <div>デッキが空です。</div>;
                  if (deck.length === 0) return null;
                  return (
                  <FixedSizeGrid
                    height={Math.min(deck.length === 0 ? gridRowHeight : Math.ceil(deck.length / gridColumns) * gridRowHeight, listSize.height)}
                    columnCount={gridColumns}
                    columnWidth={gridColWidth}
                    rowCount={Math.ceil(deck.length / gridColumns)}
                    rowHeight={gridRowHeight}
                    width={listSize.width}
                    itemData={deckItemData}
                  >
                    {CardGridCell}
                  </FixedSizeGrid>
                  );
                })()}
              </div>
            )}
            {/* トークンデッキ管理 */}
            {viewMode === 'grid' && (() => {
              // 関連トークンでも、枚数が0なら「トークン無し」扱い（表示しない）
              const tokenCardsFromDeck = collectRelatedTokensFromCards(deck)
                .filter(t => (Number(tokenDeck[t.id]) || 0) > 0);
              const fromDeckIdSet = new Set(tokenCardsFromDeck.map(t => t.id));
              const extraTokenIds = Object.entries(tokenDeck)
                .filter(([, cnt]) => (Number(cnt) || 0) > 0)
                .map(([id]) => Number(id))
                .filter(id => !fromDeckIdSet.has(id));
              const extraTokenCards = extraTokenIds
                .map(id => cardData.find(c => c.id === id))
                .filter(Boolean);
              const tokenCards = [...tokenCardsFromDeck, ...extraTokenCards];
              if (!tokenCards.length) return null;
              const tokenTotal = tokenCards.reduce((sum, t) => sum + (Number(tokenDeck[t.id]) || 0), 0);
              return (
                <div style={{ marginTop: '0.8em' }}>
                  <h3 style={{ fontSize: '1.05em', fontWeight: 'bold', margin: '0.2em 0 0.5em 0', color: '#ff9800' }}>トークンデッキ: {tokenTotal}枚</h3>
                  <div className="card-grid" style={{ width: '100%', maxWidth: '100vw', touchAction: 'pan-y' }}>
                    <FixedSizeGrid
                      height={Math.min(Math.ceil(tokenCards.length / gridColumns) * gridRowHeight, listSize.height)}
                      columnCount={gridColumns}
                      columnWidth={gridColWidth}
                      rowCount={Math.ceil(tokenCards.length / gridColumns)}
                      rowHeight={gridRowHeight}
                      width={listSize.width}
                      itemData={{ context: renderContext, cards: tokenCards, columns: gridColumns }}
                    >
                      {CardGridCell}
                    </FixedSizeGrid>
                  </div>
                </div>
              );
            })()}
            </div>
            {!isLandscape && deckFooter}
          </div>
        </div>
        {/* 保存デッキタブ */}
        <div className="tab-content" style={{ display: activeTab === 'saved' ? 'block' : 'none' }}>
          <div className="tab-workspace saved-workspace" ref={savedContainerRef} style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}>
            <div className="tab-controls">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.7em', flexWrap: 'wrap', marginBottom: '0.7em' }}>
              <h2 style={{ margin: 0 }}>保存デッキ</h2>
              <button
                type="button"
                onClick={() => setShowDeckInfoModal(true)}
                style={{ marginLeft: 'auto', background: '#455a64', color: '#fff', padding: '0.4em 0.7em', fontSize: '0.9em', whiteSpace: 'nowrap' }}
              >
                {isLandscape ? '総デッキ情報' : 'あなたのデッキ情報'}
              </button>
            </div>
            {/* JSONデッキ読込ボタン */}
            <div className="saved-deck-tools">
              <label className="saved-deck-action">
                デッキ読込
                <input type="file" accept="application/json" style={{ display: 'none' }}
                  onChange={async e => {
                    const file = e.target.files[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const deck = JSON.parse(text);
                      if (!deck || !Array.isArray(deck.cards) || !deck.name) {
                        alert('不正なデッキデータです');
                        return;
                      }

                      // 取込時に最小形式へ整形 + tokenDeckを正規化
                      const inputCards = Array.isArray(deck.cards) ? deck.cards : [];
                      const minimalCards = inputCards.map(c => ({ id: c.id, count: c.count || 0, isDeckThumbnail: !!c.isDeckThumbnail }));
                      const hasTokenDeckField = Object.prototype.hasOwnProperty.call(deck, 'tokenDeck');
                      let tokenDeckArr;
                      if (hasTokenDeckField) {
                        if (Array.isArray(deck.tokenDeck)) {
                          tokenDeckArr = deck.tokenDeck
                            .map(t => ({ id: Number(t?.id), count: Number(t?.count) || 0 }))
                            .filter(t => Number.isFinite(t.id) && t.id > 0 && t.count > 0);
                        } else if (deck.tokenDeck && typeof deck.tokenDeck === 'object') {
                          tokenDeckArr = Object.entries(deck.tokenDeck)
                            .map(([id, count]) => ({ id: Number(id), count: Number(count) || 0 }))
                            .filter(t => Number.isFinite(t.id) && t.id > 0 && t.count > 0);
                        } else {
                          tokenDeckArr = [];
                        }
                      } else {
                        // 旧型（tokenDeck無し）は関連トークンを9枚として初期化
                        const hydratedCards = rehydrateCards(minimalCards);
                        const legacyTokenCards = collectRelatedTokensFromCards(hydratedCards);
                        tokenDeckArr = legacyTokenCards.map(t => ({
                          id: Number(t.id),
                          count: Math.min(9, t.maxTokenDeckCount ?? 9),
                        })).filter(t => Number.isFinite(t.id) && t.id > 0 && t.count > 0);
                      }

                      const existingDeck = savedDecks.find(d => d.name === deck.name);
                      const normalizedDeck = withDeckSaveTimes({
                        name: deck.name,
                        cards: minimalCards,
                        ...(hasTokenDeckField ? { tokenDeck: tokenDeckArr } : {}),
                        ...(Object.prototype.hasOwnProperty.call(deck, 'thumbnailCardId') ? { thumbnailCardId: Number(deck.thumbnailCardId) || null } : {}),
                      }, existingDeck);
                      // 既存と同名なら上書き確認
                      const exists = savedDecks.some(d => d.name === normalizedDeck.name);
                      if (exists && !window.confirm(`同名のデッキ「${normalizedDeck.name}」を上書きしますか？`)) return;
                      if (user && !await upsertCloudDeck(user.id, normalizedDeck, deckScope)) return;
                      setSavedDecks(prev => {
                        return existingDeck
                          ? prev.map(d => d.name === normalizedDeck.name ? normalizedDeck : d)
                          : [...prev, normalizedDeck];
                      });
                      alert(`デッキ「${normalizedDeck.name}」を保存デッキに追加しました`);
                    } catch {
                      alert('ファイルの読み込みに失敗しました');
                    }
                    e.target.value = '';
                  }}
                />
              </label>
              <button type="button" className="saved-deck-action" aria-expanded={showSavedDeckOptions} aria-controls="saved-deck-options" onClick={() => setShowSavedDeckOptions(open => !open)}>
                フィルター・並び替え
              </button>
              <input
                type="text"
                aria-label="保存デッキ検索"
                placeholder="デッキ名で検索"
                value={savedDeckSearch}
                onChange={e => setSavedDeckSearch(e.target.value)}
                style={{ flex: '1 1 12em', minWidth: 0 }}
              />
              <button
                type="button"
                className="saved-deck-action"
                onClick={() => { setSavedDeckSearch(''); setSavedDeckFilters(EMPTY_DECK_FILTERS); }}
                disabled={!savedDeckSearch && !Object.values(savedDeckFilters).some(Boolean)}
              >
                条件リセット
              </button>
              {showSavedDeckOptions && (
                <div id="saved-deck-options" className="saved-deck-options-panel">
                  <SavedDeckFilters filters={savedDeckFilters} options={savedDeckFilterOptions} onChange={setSavedDeckFilters}>
                    <SavedDeckSort sortKey={savedDeckSortKey} direction={savedDeckSortDirection} onSortKeyChange={key => { setSavedDeckSortKey(key); if (key === 'hit') setSavedDeckSortDirection('desc'); }} onDirectionChange={setSavedDeckSortDirection} />
                  </SavedDeckFilters>
                </div>
              )}
            </div>
            <p className="saved-deck-results-count" role="status">全{savedDecks.length}デッキ中 {filteredSavedDecks.length}件</p>
            </div>
            <div className="tab-results">
            {(libraryError || !library?.shared) && <div role="status">{libraryError || (userId ? 'このアカウントのデッキ' : 'この端末のデッキ')}</div>}
            <div className="saved-decks-grid">
              {savedDecks.length === 0 && <div>保存デッキなし</div>}
              {savedDecks.length > 0 && filteredSavedDecks.length === 0 && <div>一致するデッキなし</div>}
              {filteredSavedDecks.map((saved) => {
                const mainCount = (saved.cards || []).reduce((sum, c) => sum + (c.count || 0), 0);
                const hasTokenDeckField = Object.prototype.hasOwnProperty.call(saved, 'tokenDeck');
                const tokenCount = hasTokenDeckField
                  ? (
                    Array.isArray(saved.tokenDeck)
                      ? saved.tokenDeck.reduce((sum, t) => sum + (t?.count || 0), 0)
                      : (saved.tokenDeck && typeof saved.tokenDeck === 'object')
                        ? Object.values(saved.tokenDeck).reduce((sum, v) => sum + (Number(v) || 0), 0)
                        : 0
                  )
                  : (() => {
                    const hydratedCards = rehydrateCards(saved.cards || []);
                    const legacyTokenCards = collectRelatedTokensFromCards(hydratedCards);
                    return legacyTokenCards.reduce((sum, t) => sum + Math.min(9, t.maxTokenDeckCount ?? 9), 0);
                  })();

                return (
                <div className="saved-deck-card" key={saved.name}
                  onClick={e => {
                    // 編集・削除ボタン以外のクリックで詳細ウィンドウ
                    if (
                      e.target.closest('.deck-actions')
                    ) return;
                    // 最新データに再結合した上で詳細を表示
                    const hydratedCards = rehydrateCards(saved.cards);
                    const relatedTokens = collectRelatedTokensFromCards(hydratedCards);
                    const hasTokenDeckField = Object.prototype.hasOwnProperty.call(saved, 'tokenDeck');
                    let tokenDeckArr;
                    if (hasTokenDeckField) {
                      if (Array.isArray(saved.tokenDeck)) {
                        tokenDeckArr = saved.tokenDeck
                          .map(t => ({ id: Number(t?.id), count: Number(t?.count) || 0 }))
                          .filter(t => Number.isFinite(t.id) && t.id > 0 && t.count > 0);
                      } else if (saved.tokenDeck && typeof saved.tokenDeck === 'object') {
                        tokenDeckArr = Object.entries(saved.tokenDeck)
                          .map(([id, count]) => ({ id: Number(id), count: Number(count) || 0 }))
                          .filter(t => Number.isFinite(t.id) && t.id > 0 && t.count > 0);
                      } else {
                        tokenDeckArr = [];
                      }
                    } else {
                      // 旧型（tokenDeck無し）は関連トークンを9枚として初期化
                      tokenDeckArr = relatedTokens.map(t => ({
                        id: Number(t.id),
                        count: Math.min(9, t.maxTokenDeckCount ?? 9),
                      })).filter(t => Number.isFinite(t.id) && t.id > 0 && t.count > 0);
                    }
                    const detail = { ...saved, cards: hydratedCards, relatedTokens, tokenDeck: tokenDeckArr };
                    setDetailDeckViewMode(isLandscape ? 'grid' : viewMode);
                    setDetailDeck(detail);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <div style={{ textAlign: 'center', marginBottom: '0.5em' }}>
                    {/* サムネイル画像表示 */}
                    {saved.thumbnail ? (
                      <img src={saved.thumbnail} alt="サムネイル" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '2px solid #1976d2' }} />
                    ) : (
                      (() => {
                        const hydrated = rehydrateCards(saved.cards || []);
                        const thumbFromCards = hydrated.find(c => c.isDeckThumbnail)?.id ?? hydrated[0]?.id ?? null;
                        const thumbFromTokens = (() => {
                          const td = saved.tokenDeck;
                          if (Array.isArray(td)) return td.find(t => (Number(t?.count) || 0) > 0)?.id ?? null;
                          if (td && typeof td === 'object') return Object.entries(td).find(([, cnt]) => (Number(cnt) || 0) > 0)?.[0] ?? null;
                          return null;
                        })();
                        const thumbId = (saved.thumbnailCardId ?? null) ?? thumbFromCards ?? (thumbFromTokens ? Number(thumbFromTokens) : null);
                        if (!thumbId) return null;
                        const card = cardMapById.get(Number(thumbId));
                        if (!card) return null;
                        const isDoubleSided = card.isDoubleSided && card.front && card.back;
                        const displayCard = isDoubleSided ? card.front : card;
                        return <img src={displayCard.image} alt="サムネイル" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '2px solid #1976d2' }} />;
                      })()
                    )}
                  </div>
                  <div className="deck-title">{saved.name}</div>
                  <div className="deck-count">メイン{mainCount}枚{tokenCount > 0 ? ` トークン${tokenCount}枚` : ''}</div>
                  <div className="deck-actions">
                    <button style={{ background: '#1976d2' }} onClick={e => { e.stopPropagation(); loadDeck(saved.name); }}>編集</button>
                    <button style={{ background: '#d32f2f' }} onClick={e => { e.stopPropagation(); deleteDeckByName(saved.name); }}>削除</button>
                  </div>
                </div>
              );
              })}
            </div>
            </div>
          </div>
        </div>
        {/* QAタブ（ルール・裁定） */}
        <div className="tab-content" style={{ display: activeTab === 'qa' ? 'block' : 'none' }}>
          <div className="tab-workspace qa-workspace" ref={qaContainerRef} style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}>
          <div className="tab-controls">
          <h2>QA（ルール・裁定）</h2>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>キーワード検索</label>
              <div className="input-row" style={{ gap: '0.5em' }}>
                <input
                  type="text"
                  placeholder="例: 真・導託 同名制限 / コアの移動 など"
                  value={qaQuery}
                  onChange={(e) => setQaQuery(e.target.value)}
                />
                <span style={{ color: '#666', fontSize: '0.9em' }}>（QAを検索）</span>
              </div>
            </div>
          </div>

            <div className="tab-results qa-results">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontWeight: 'bold' }}>検索結果</label>
                <span style={{ color: '#666', fontSize: '0.9em' }}>{filteredQa.length} 件</span>
              </div>
              <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
                {filteredQa.length === 0 && (
                  <div style={{ padding: '0.8em', color: '#777' }}>一致するQAが見つかりませんでした。</div>
                )}
                {filteredQa.map((item, idx) => {
                  const m = String(item.id || '').match(/\d+/);
                  const qNum = m ? parseInt(m[0], 10) : (idx + 1); // 先頭ゼロはparseIntで自然に除去
                  return (
                  <div key={item.id} style={{ borderTop: '1px solid #eee' }}>
                    <button
                      onClick={() => toggleQa(item.id)}
                      onMouseEnter={() => setQaHover(prev => ({ ...prev, [item.id]: true }))}
                      onMouseLeave={() => setQaHover(prev => ({ ...prev, [item.id]: false }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.6em', width: '100%', textAlign: 'left',
                        padding: '0.7em 0.9em',
                        background: (qaOpen[item.id] || qaHover[item.id]) ? '#1976d2' : '#fafafa',
                        border: 'none', cursor: 'pointer',
                        color: (qaOpen[item.id] || qaHover[item.id]) ? '#fff' : '#000'
                      }}
                    >
                      <span style={{ fontWeight: 'bold', color: (qaOpen[item.id] || qaHover[item.id]) ? '#fff' : '#1976d2' }}>{`Q${qNum}`}</span>
                      <span style={{ flex: 1, color: (qaOpen[item.id] || qaHover[item.id]) ? '#fff' : '#000' }}>{item.question}</span>
                      <span style={{ color: (qaOpen[item.id] || qaHover[item.id]) ? '#fff' : '#999' }}>{qaOpen[item.id] ? '▲' : '▼'}</span>
                    </button>
                    {qaOpen[item.id] && (
                      <div style={{ padding: '0.7em 1em 0.9em 2.2em', background: '#fff' }}>
                        <div style={{ marginBottom: '0.5em' }}>
                          <div style={{ fontWeight: 'bold', color: '#388e3c', marginBottom: 4 }}>A.</div>
                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}dangerouslySetInnerHTML={{ __html: item.answer }}/>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4em', flexWrap: 'wrap', marginTop: 6 }}>
                          {(item.tags || []).map(tag => (
                            <span key={tag} style={{ fontSize: '0.85em', background: '#e3f2fd', color: '#1976d2', padding: '0.1em 0.5em', borderRadius: 999 }}>{getPackLabel(tag)}</span>
                          ))}
                          {item.updatedAt && (
                            <span style={{ marginLeft: 'auto', color: '#999', fontSize: '0.85em' }}>更新: {item.updatedAt}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </div>

      <ExportFilesModal
        open={!!exportFilesModal}
        title={exportFilesModal?.title}
        files={exportFilesModal?.files}
        onClose={closeExportFilesModal}
      />
      {showDeckInfoModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1em' }}
          onClick={() => setShowDeckInfoModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, padding: '1.2em 1em 1em 1em', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="閉じる"
              style={{ position: 'absolute', top: 8, right: 12, fontSize: '1.3em' }}
              onClick={() => setShowDeckInfoModal(false)}
            >
              ×
            </button>
            <h2 style={{ margin: '0 2em 0.8em 0' }}>{isLandscape ? '総デッキ情報' : 'あなたのデッキ情報'}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.7em', marginBottom: '1em' }}>
              <div style={{ background: '#f0f4f8', borderRadius: 8, padding: '0.8em' }}>
                <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 4 }}>総デッキ数</div>
                <div style={{ color: '#1976d2', fontSize: '1.8em', fontWeight: 'bold', lineHeight: 1 }}>{deckInfo.totalDecks}</div>
              </div>
              <div style={{ background: '#f0f4f8', borderRadius: 8, padding: '0.8em' }}>
                <div style={{ color: '#666', fontSize: '0.9em', marginBottom: 4 }}>デザイナーズアーキタイプ網羅数</div>
                <div style={{ color: '#388e3c', fontSize: '1.8em', fontWeight: 'bold', lineHeight: 1 }}>
                  {deckInfo.coveredArchetypes.length}<span style={{ color: '#777', fontSize: '0.55em' }}> / {deckInfo.totalArchetypes}</span>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1.05em', margin: '0 0 0.6em 0' }}>作っていないアーキタイプ一覧</h3>
              {deckInfo.missingArchetypes.length === 0 ? (
                <div style={{ color: '#388e3c', fontWeight: 'bold' }}>すべて作成済み</div>
              ) : (
                <div style={{ display: 'flex', gap: '0.45em', flexWrap: 'wrap' }}>
                  {deckInfo.missingArchetypes.map(archetype => (
                    <span
                      key={archetype.key}
                      title={`${archetype.packTitle || archetype.name} (${archetype.cardTypeCount}種)`}
                      style={{ background: '#e3f2fd', color: '#1976d2', borderRadius: 999, padding: '0.22em 0.65em', fontWeight: 'bold', fontSize: '0.95em' }}
                    >
                      {archetype.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* デッキ詳細ウィンドウ */}
      {detailDeck && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDetailDeck(null)}>
          <div className="dvm-content" onClick={e => e.stopPropagation()}>
            <button
              className="dvm-layout-close"
              aria-label="デッキ詳細を閉じる"
              style={{ position: 'absolute', top: 8, right: 12, fontSize: '1.3em' }}
              onClick={() => setDetailDeck(null)}
            >
              ×
            </button>
            <div className="dvm-sidebar">
            <h2 className="dvm-title">{detailDeck.name}</h2>
            <div className="dvm-header">
              {(() => {
                const thumb = detailDeck.thumbnail;
                if (thumb) {
                  return <img src={thumb} alt="サムネイル" className="dvm-thumb" />;
                }
                const cards = Array.isArray(detailDeck.cards) ? detailDeck.cards : [];
                const card = cards.find(c => c.isDeckThumbnail) || cards[0];
                if (!card) return null;
                const isDoubleSided = card.isDoubleSided && card.front && card.back;
                const displayCard = isDoubleSided ? card.front : card;
                const src = displayCard?.image;
                if (!src) return null;
                return <img src={src} alt="サムネイル" className="dvm-thumb" />;
              })()}
              <span style={{ fontWeight: 'bold', color: '#1976d2', marginRight: '1em' }}>メインデッキ: {detailDeck.cards.reduce((sum, c) => sum + (c.count || 0), 0)}枚</span>
              {/* ▼▼▼ PDF出力＆リスト/グリッド切替ボタンを横並びにまとめる ▼▼▼ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexWrap: 'wrap' }}>
                <button style={{ background: '#1976d2', color: '#fff', borderRadius: '6px', padding: '0.4em 0.5em', fontWeight: 'bold', fontSize: '1em', border: 'none', cursor: 'pointer' }}
                  onClick={async () => { await exportDeckToA4PDF(detailDeck); }}>
                  PDF
                </button>
                <button style={{ background: '#388e3c', color: '#fff', borderRadius: '6px', padding: '0.4em 0.5em', fontWeight: 'bold', fontSize: '1em', border: 'none', cursor: 'pointer' }}
                  onClick={() => exportSingleDeckAsJson(detailDeck)}>
                  JSON
                </button>
                <button style={{ display: 'none' }}
                  onClick={async () => { await exportDeckAsSVG(detailDeck); }}>
                  SVG
                </button>
                <button style={{ background: '#3949ab', color: '#fff', borderRadius: '6px', padding: '0.4em 0.5em', fontWeight: 'bold', fontSize: '1em', border: 'none', cursor: 'pointer' }}
                  onClick={async () => { await exportDeckSvgToPng(detailDeck); }}>
                  PNG
                </button>
                <button className={`view-toggle-btn${detailDeckViewMode === 'list' ? ' active' : ''}`} onClick={() => setDetailDeckViewMode('list')}>≡</button>
                <button className={`view-toggle-btn${detailDeckViewMode === 'grid' ? ' active' : ''}`} onClick={() => setDetailDeckViewMode('grid')}>■</button>
              </div>
            </div>
            </div>
            <div className="dvm-cards">
            {/* デッキ詳細リスト/グリッド */}
            {detailDeckViewMode === 'list' ? (
              (() => {
                const mainCards = sortDeckCards(detailDeck.cards);

                const related = Array.isArray(detailDeck.relatedTokens) ? detailDeck.relatedTokens : [];
                const tokenDeckArr = Array.isArray(detailDeck.tokenDeck) ? detailDeck.tokenDeck : [];
                const tokenCountMap = new Map(tokenDeckArr.map(t => [Number(t.id), Number(t.count) || 0]));
                const relatedIdSet = new Set(related.map(t => Number(t.id)));
                const extraTokenIds = tokenDeckArr
                  .filter(t => (Number(t.count) || 0) > 0)
                  .map(t => Number(t.id))
                  .filter(id => !relatedIdSet.has(id));
                const extra = extraTokenIds
                  .map(id => cardData.find(c => Number(c.id) === id))
                  .filter(Boolean);
                // 枚数が0のトークンは「トークン無し」扱い（表示しない）
                const tokenCards = [...related, ...extra]
                  .filter(tc => (tokenCountMap.get(Number(tc.id)) || 0) > 0);
                const tokenTotal = tokenCards.reduce((sum, tc) => sum + (tokenCountMap.get(Number(tc.id)) || 0), 0);

                return (
                  <div className="dvm-list-area">
                    {mainCards.map(card => {
                      const isDoubleSided = card.isDoubleSided && card.front && card.back;
                      const displayCard = isDoubleSided ? card.front : card;
                      const typeText = isDoubleSided ? `${card.front.type} / ${card.back.type}` : card.type;
                      return (
                        <div key={card.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: '4px', cursor: 'pointer' }}
                          onClick={() => { setDetailCard(card); setShowFront(true); }}>
                          <img src={displayCard.image} alt={displayCard.name} style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 5 }} />
                          <span style={{ flex: 1 }}><b>{card.name}</b> <span style={{ fontSize: '0.97em', color: '#666' }}>({typeText})</span></span>
                          <span style={{ color: '#1976d2', fontWeight: 'bold' }}>{card.count}枚</span>
                        </div>
                      );
                    })}

                    {tokenCards.length > 0 && (
                      <div style={{ marginTop: '0.8em' }}>
                        <div style={{ fontSize: '1.05em', fontWeight: 'bold', marginBottom: '0.5em', color: '#ff9800' }}>トークンデッキ: {tokenTotal}枚</div>
                        {tokenCards.map(tokenCard => {
                          const cnt = tokenCountMap.get(Number(tokenCard.id)) || 0;
                          const maxT = tokenCard.maxTokenDeckCount ?? 9;
                          return (
                            <div
                              key={tokenCard.id}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.7em', marginBottom: '4px', cursor: 'pointer' }}
                              onClick={() => { setDetailCard(tokenCard); setShowFront(true); }}
                            >
                              <img src={tokenCard.image} alt={tokenCard.name} style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 5 }} />
                              <span style={{ flex: 1 }}><b>{tokenCard.name}</b> <span style={{ fontSize: '0.97em', color: '#666' }}>({tokenCard.type})</span></span>
                              <span style={{ color: '#ff9800', fontWeight: 'bold' }}>{cnt} / {maxT}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="card-grid dvm-grid">
                {sortDeckCards(detailDeck.cards).map(card => {
                  const isDoubleSided = card.isDoubleSided && card.front && card.back;
                  const displayCard = isDoubleSided ? card.front : card;
                  return (
                    <div key={card.id} style={{ position: 'relative', width: '100%', aspectRatio: '385/561', background: '#fff', borderRadius: 5, boxShadow: '0 1px 4px #bbb', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      onClick={() => { setDetailCard(card); setShowFront(true); }}>
                      <img src={displayCard.image} alt={displayCard.name} style={{ width: '98%', height: '98%', objectFit: 'cover', borderRadius: 5, background: '#fff', display: 'block' }} />
                      <span style={{ position: 'absolute', top: 0, right: 0, background: '#1976d2', color: '#fff', borderRadius: '50%', width: '1.25em', height: '1.25em', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1em', fontWeight: 'bold', boxShadow: '0 1px 4px #bbb', zIndex: 3, pointerEvents: 'none' }}>{card.count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* トークンカードセクション */}
            {detailDeckViewMode === 'grid' && (() => {
              const related = Array.isArray(detailDeck.relatedTokens) ? detailDeck.relatedTokens : [];
              const tokenDeckArr = Array.isArray(detailDeck.tokenDeck) ? detailDeck.tokenDeck : [];
              const tokenCountMap = new Map(tokenDeckArr.map(t => [Number(t.id), Number(t.count) || 0]));
              const relatedIdSet = new Set(related.map(t => Number(t.id)));
              const extraTokenIds = tokenDeckArr
                .filter(t => (Number(t.count) || 0) > 0)
                .map(t => Number(t.id))
                .filter(id => !relatedIdSet.has(id));
              const extra = extraTokenIds
                .map(id => cardData.find(c => Number(c.id) === id))
                .filter(Boolean);
              // 枚数が0のトークンは「トークン無し」扱い（表示しない）
              const tokenCards = [...related, ...extra]
                .filter(tc => (tokenCountMap.get(Number(tc.id)) || 0) > 0);
              if (!tokenCards.length) return null;
              const tokenTotal = tokenCards.reduce((sum, tc) => sum + (tokenCountMap.get(Number(tc.id)) || 0), 0);

              return (
              <div style={{ marginTop: '1.5em' }}>
                <h3 style={{ fontSize: '1.1em', fontWeight: 'bold', marginBottom: '0.7em', color: '#ff9800' }}>トークンデッキ: {tokenTotal}枚</h3>
                <div className="card-grid dvm-grid">
                  {tokenCards.map(tokenCard => (
                    <div key={tokenCard.id} style={{ position: 'relative', width: '100%', aspectRatio: '385/561', background: '#fff', borderRadius: 5, boxShadow: '0 1px 4px #bbb', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      onClick={() => { setDetailCard(tokenCard); setShowFront(true); }}>
                      <img src={tokenCard.image} alt={tokenCard.name} style={{ width: '98%', height: '98%', objectFit: 'cover', borderRadius: 5, background: '#fff', display: 'block' }} />
                      {(() => {
                        const cnt = tokenCountMap.get(Number(tokenCard.id)) || 0;
                        if (cnt <= 0) return null;
                        return (
                          <span style={{ position: 'absolute', top: 0, right: 0, background: '#ff9800', color: '#fff', borderRadius: '50%', width: '1.25em', height: '1.25em', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1em', fontWeight: 'bold', boxShadow: '0 1px 4px #bbb', zIndex: 3, pointerEvents: 'none' }}>{cnt}</span>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
              );
            })()}
            </div>
          </div>
        </div>
      )}
      {/* カード詳細モーダルは最前面に表示 */}
      {detailCard && (
        <CardDetailModal
          card={detailCard}
          show={!!detailCard}
          onClose={closeCardDetail}
          zIndex={3000}
          onSetDeckThumbnail={async (cardId) => {
            const idNum = Number(cardId);
            setDeckThumbnailCardId(Number.isFinite(idNum) ? idNum : null);

            // メインデッキ内にあるカードなら従来通りフラグを付ける。トークンのみの場合は全てfalseのまま。
            setDeck(deck => {
              const existsInMain = deck.some(c => Number(c.id) === idNum);
              if (!existsInMain) return deck.map(c => ({ ...c, isDeckThumbnail: false }));
              return deck.map(c => Number(c.id) === idNum ? { ...c, isDeckThumbnail: true } : { ...c, isDeckThumbnail: false });
            });
            const updatedDecks = savedDecks.map(saved => saved.name !== currentDeckName ? saved : {
              ...withDeckSaveTimes(saved, saved),
              thumbnailCardId: Number.isFinite(idNum) ? idNum : null,
              cards: (saved.cards || []).map(card => ({ ...card, isDeckThumbnail: Number(card.id) === idNum })),
            });
            const changed = updatedDecks.find(saved => saved.name === currentDeckName);
            if (user && changed && !await upsertCloudDeck(user.id, changed, deckScope)) return;
            setSavedDecks(updatedDecks);
          }}
          inDeck={detailCard ? (deck.some(c => c.id === detailCard.id) || ((Number(tokenDeck?.[detailCard.id]) || 0) > 0)) : false}
          countInDeck={detailCard ? getCardCountInDeck(detailCard.id) : 0}
          onIncrease={increaseCardCount}
          onDecrease={decreaseCardCount}
          getTokenCountInDeck={(cardId) => tokenDeck?.[cardId] || 0}
          onTokenIncrease={increaseTokenCount}
          onTokenDecrease={decreaseTokenCount}
          showFront={showFront}
          setShowFront={setShowFront}
          hideDeckActions={detailHideDeckActions || !!detailDeck} // 明示指定 or デッキ詳細ウィンドウから開いた場合は非表示
        />
      )}
    </div>
  );
}

// --- ホーム: 募集中イベント表示 ---
function HomeRecruitingEvents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [myEventIds, setMyEventIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(null); // 参加処理中のeventId

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: evData } = await supabase
        .from('events')
        .select('id, name, date, format, match_type, deck_count')
        .eq('game', APP_GAME_ID)
        .eq('status', 'recruiting')
        .order('date', { ascending: true });
      if (cancelled) return;
      setEvents(evData || []);

      if (user && evData && evData.length > 0) {
        const eventIds = evData.map(e => e.id);
        const { data: parts } = await supabase
          .from('event_participants')
          .select('event_id')
          .eq('user_id', user.id)
          .in('event_id', eventIds);
        if (!cancelled) {
          setMyEventIds(new Set((parts || []).map(p => p.event_id)));
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleJoin = async (eventId) => {
    if (!user) { navigate('/login'); return; }
    setJoining(eventId);
    const { error } = await supabase.from('event_participants').insert({
      event_id: eventId,
      user_id: user.id,
    });
    if (error) {
      alert('参加に失敗しました: ' + error.message);
    } else {
      setMyEventIds(prev => new Set([...prev, eventId]));
    }
    setJoining(null);
  };

  const formatLabel = { swiss: 'スイスドロー', round_robin: '総当たり', single_elimination: 'トーナメント' };
  const matchTypeLabel = { bo1: '1本先取', bo3: 'BO3' };

  if (loading) return null;
  if (events.length === 0) return null;

  return (
    <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', padding: '10px', borderRadius: 6, marginBottom: 12 }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>🎪 開催予定のイベント</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {events.map(ev => {
          const joined = myEventIds.has(ev.id);
          return (
            <div key={ev.id} style={{
              background: '#fff', borderRadius: 8, padding: '0.7em',
              border: '1px solid #bbdefb', cursor: 'pointer',
            }} onClick={() => navigate(`/events/${ev.id}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95em' }}>{ev.name}</div>
                  <div style={{ fontSize: '0.8em', color: '#666' }}>
                    {ev.date} ・ {formatLabel[ev.format] || ev.format} ・ {matchTypeLabel[ev.match_type] || ev.match_type} ・ {ev.deck_count === 2 ? '2デッキ制' : '1デッキ制'}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {joined ? (
                    <button
                      onClick={() => navigate(`/events/${ev.id}`)}
                      style={{
                        background: '#fff', border: '1px solid #2e7d32', color: '#2e7d32', borderRadius: 6,
                        padding: '1em 0.8em', fontSize: '1em', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap',
                      }}
                    >
                      ✅ 応募済み
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoin(ev.id)}
                      disabled={joining === ev.id}
                      style={{
                        background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6,
                        padding: '1em 0.8em', fontSize: '1em', cursor: joining === ev.id ? 'default' : 'pointer',
                        fontWeight: 'bold', whiteSpace: 'nowrap', opacity: joining === ev.id ? 0.6 : 1,
                      }}
                    >
                      {joining === ev.id ? '処理中...' : '応募する'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HomeErrataList({ onOpenCard }) {
  // 日付の新しい順に並べ替え
  const items = useMemo(() => {
    const toTime = (d) => {
      if (!d) return 0;
      // 'YYYY-MM-DD' 想定だが、Date.parseでフォールバック
      const t = Date.parse(d);
      return isNaN(t) ? 0 : t;
    };
    return [...errataData].sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
  }, []);
  if (!items || items.length === 0) {
    return (
      <div style={{ background: '#f9f9f9', border: '1px solid #ddd', padding: '10px', borderRadius: 6 }}>
        <h3 style={{ marginTop: 0 }}>エラッタ情報</h3>
        <div style={{ color: '#666' }}>現在、公開中のエラッタはありません。</div>
      </div>
    );
  }

  const resolveCardByNumber = (num) => {
    if (!num) return null;
    // ダブルフェイス対応：front/back どちらかの number が一致するカードを探す
    return cardData.find(card => {
      if (card.isDoubleSided && card.front && card.back) {
        const fnum = card.front.cardNumber || card.front.number;
        const bnum = card.back.cardNumber || card.back.number;
        return fnum === num || bnum === num;
      }
      const cnum = card.cardNumber || card.number;
      return cnum === num;
    });
  };

  const getDisplayInfo = (item) => {
    const num = item.number;
    const card = resolveCardByNumber(num);
    // 名前
    const name = item.name || (card ? (card.isDoubleSided ? ((card.front.cardNumber || card.front.number) === num ? card.front.name : card.back.name) : card.name) : '');
    // 収録弾
    const pack = item.pack || (card ? (card.isDoubleSided ? ((card.front.cardNumber || card.front.number) === num ? (card.front.pack || '') : (card.back.pack || '')) : (card.pack || '')) : '');
    // 画像: errataData.image 優先、なければ images/番号.png を推測
    const rawImage = item.image || (num ? `images/${num}.png` : '');
    const image = versionedImageUrl(rawImage);
    return { name, pack, image };
  };

  return (
    <div style={{ background: '#f9f9f9', border: '1px solid #ddd', padding: '10px', borderRadius: 6 }}>
      <h3 style={{ marginTop: 0 }}>エラッタ情報</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        {items.map(item => {
          const { name, pack, image } = getDisplayInfo(item);
          const card = resolveCardByNumber(item.number);
          return (
            <div key={item.id || item.number} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'start' }}>
              {image ? (
                <img
                  src={image}
                  alt={name || item.number}
                  style={{ width: 96, height: 'auto', objectFit: 'contain', border: '1px solid #ccc', borderRadius: 4, cursor: card ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (card && typeof onOpenCard === 'function') {
                      onOpenCard(card);
                    }
                  }}
                />
              ) : (
                <div style={{ width: 96, height: 96, border: '1px solid #ccc', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777' }}>No Image</div>
              )}
              <div>
                <div style={{ fontWeight: 'bold' }}>{item.number}｜{name || '(名称不明)'}</div>
                <div style={{ color: '#555', fontSize: '0.95em' }}>{getPackLabel(pack) || '(収録弾不明)'}</div>
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{item.content}</div>
                {item.updatedAt && (
                  <div style={{ marginTop: 4, color: '#777', fontSize: '0.85em' }}>更新日: {item.updatedAt}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
