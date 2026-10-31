import React, { useState } from 'react';
import cardData from '../cardData';
import { toAbsPath } from '../utils/deckUtils';
import { getPackLabel } from '../utils/deckPacks';
import '../styles/modal.css';

const cellStyle = { border: '1px solid #ddd', padding: '2px 6px', background: '#f5f5f5' };

/**
 * カード詳細モーダル（共通コンポーネント）
 *
 * hideDeckActions=true でデッキ操作ボタンを非表示にする（閲覧専用モード）。
 * useAbsPath=true で画像パスを絶対パスに変換する（/events/:id 等のネスト配下で使用）。
 */
export default function CardDetailModal({
  card,
  show = true,
  onClose,
  onSetDeckThumbnail,
  inDeck,
  countInDeck,
  onIncrease,
  onDecrease,
  getTokenCountInDeck,
  onTokenIncrease,
  onTokenDecrease,
  showFront: showFrontProp,
  setShowFront: setShowFrontProp,
  hideDeckActions = false,
  useAbsPath = false,
  zIndex = 1000,
}) {
  // 閲覧専用モード用の内部 showFront state
  const [internalShowFront, setInternalShowFront] = useState(true);
  // トークン表示用のstate
  const [tokenIndex, setTokenIndex] = useState(null);
  const showFront = showFrontProp !== undefined ? showFrontProp : internalShowFront;
  const setShowFront = setShowFrontProp || setInternalShowFront;

  if (show === false || !card) return null;

  // ダブルフェイス対応
  const isDoubleSided = card.isDoubleSided && card.front && card.back;
  const hasRelatedTokens = card.relatedTokens && card.relatedTokens.length > 0;
  const showToken = tokenIndex !== null;

  const getTokenCard = (tokenName) => cardData.find(c => c.name === tokenName);

  let activeSide;
  if (showToken && hasRelatedTokens) {
    const resolved = getTokenCard(card.relatedTokens[tokenIndex]);
    activeSide = resolved || (isDoubleSided ? (showFront ? card.front : card.back) : card);
  } else {
    activeSide = isDoubleSided ? (showFront ? card.front : card.back) : card;
  }

  const handleTokenToggle = () => {
    if (!showToken && hasRelatedTokens) setTokenIndex(0);
    else setTokenIndex(null);
  };

  const isTokenCard = (c) => {
    if (!c) return false;
    if (c.isDoubleSided && c.front && c.back) {
      return (c.front.type || '').includes('トークン') || (c.back.type || '').includes('トークン');
    }
    return (c.type || '').includes('トークン');
  };

  const activeIsToken = isTokenCard(activeSide);
  const mainMaxCount = isTokenCard(card) ? 0 : (card?.maxDeckCount ?? 3);
  const tokenMaxCount = activeSide?.maxTokenDeckCount ?? 9;
  const maxCount = activeIsToken ? tokenMaxCount : mainMaxCount;
  const currentCount = activeIsToken
    ? (typeof getTokenCountInDeck === 'function' ? (Number(getTokenCountInDeck(activeSide.id)) || 0) : 0)
    : countInDeck;

  const handleIncrease = () => {
    if (activeIsToken) {
      if (typeof onTokenIncrease === 'function') onTokenIncrease(activeSide.id);
      return;
    }
    if (typeof onIncrease === 'function') onIncrease(card.id);
  };
  const handleDecrease = () => {
    if (activeIsToken) {
      if (typeof onTokenDecrease === 'function') onTokenDecrease(activeSide.id);
      return;
    }
    if (typeof onDecrease === 'function') onDecrease(card.id);
  };

  const imgSrc = useAbsPath ? toAbsPath(activeSide.image) : activeSide.image;

  return (
    <div className="cdm-overlay" style={zIndex !== 1000 ? { zIndex } : undefined} onClick={onClose}>
      <div className="cdm-content" onClick={e => e.stopPropagation()}>
        <button className="cdm-close" aria-label="カード詳細を閉じる" onClick={onClose}>×</button>
        <div className="cdm-image-wrap">
          <img src={imgSrc} alt={activeSide.name} className="cdm-card-img" />
        </div>
        {/* ダブルフェイス切り替え */}
        {isDoubleSided && !showToken && (
          <button className="cdm-toggle-btn" onClick={() => setShowFront(f => !f)}>
            {showFront ? '裏面を見る' : '表面に戻す'}
          </button>
        )}
        {/* トークン切り替え（ダブルフェイスでない場合） */}
        {hasRelatedTokens && !isDoubleSided && (
          <div style={{ textAlign: 'center', marginBottom: '1em' }}>
            <button className="cdm-token-toggle" onClick={handleTokenToggle}>
              {showToken ? '元のカードに戻る' : 'トークンを見る'}
            </button>
            {showToken && card.relatedTokens.length > 1 && (
              <div className="cdm-token-nav">
                <button onClick={() => setTokenIndex(i => Math.max(0, i - 1))} disabled={tokenIndex === 0}>◀</button>
                <span>{activeSide.name}（{tokenIndex + 1}/{card.relatedTokens.length}）</span>
                <button onClick={() => setTokenIndex(i => Math.min(card.relatedTokens.length - 1, i + 1))} disabled={tokenIndex === card.relatedTokens.length - 1}>▶</button>
              </div>
            )}
          </div>
        )}
        {/* ダブルフェイス＋トークン両方持ち */}
        {isDoubleSided && hasRelatedTokens && (
          <div style={{ textAlign: 'center', marginBottom: '1em' }}>
            <div style={{ display: 'flex', gap: '0.5em', justifyContent: 'center' }}>
              {!showToken && (
                <button className="cdm-toggle-btn" onClick={() => setShowFront(f => !f)}>
                  {showFront ? '裏面を見る' : '表面に戻す'}
                </button>
              )}
              <button className="cdm-token-toggle" onClick={handleTokenToggle}>
                {showToken ? '元のカードに戻る' : 'トークンを見る'}
              </button>
            </div>
            {showToken && card.relatedTokens.length > 1 && (
              <div className="cdm-token-nav">
                <button onClick={() => setTokenIndex(i => Math.max(0, i - 1))} disabled={tokenIndex === 0}>◀</button>
                <span>{activeSide.name}（{tokenIndex + 1}/{card.relatedTokens.length}）</span>
                <button onClick={() => setTokenIndex(i => Math.min(card.relatedTokens.length - 1, i + 1))} disabled={tokenIndex === card.relatedTokens.length - 1}>▶</button>
              </div>
            )}
          </div>
        )}
        {/* デッキ操作ボタン群 */}
        {!hideDeckActions && (
          <>
            <div style={{ minHeight: '2.5em', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1em' }}>
              {onSetDeckThumbnail && !card.isBanned && (activeIsToken ? (currentCount > 0) : inDeck) && (activeIsToken ? tokenMaxCount > 0 : mainMaxCount > 0) ? (
                <button className="cdm-thumbnail-btn" onClick={() => { onSetDeckThumbnail(activeIsToken ? activeSide.id : card.id); onClose(); }}>
                  デッキ画像に指定
                </button>
              ) : (
                <span style={{ display: 'inline-block', width: '8.5em', height: '2.2em' }}></span>
              )}
            </div>
            <div className="cdm-deck-controls">
              {maxCount > 0 ? (
                <>
                  <button
                    onClick={handleDecrease}
                    className={`cdm-btn-minus${activeIsToken ? ' token' : ''}`}
                    disabled={currentCount <= 0}
                  >-</button>
                  <span>{currentCount} / {maxCount}</span>
                  <button
                    onClick={handleIncrease}
                    className={`cdm-btn-plus${activeIsToken ? ' token' : ''}`}
                    disabled={currentCount >= maxCount}
                  >+</button>
                </>
              ) : !activeIsToken ? (
                <span className="cdm-cannot-add">このカードはデッキに入れられません。</span>
              ) : null}
            </div>
          </>
        )}
        <h2 className="cdm-card-name">{activeSide.name}</h2>
        <div className="cdm-meta">
          <span>属性: {(activeSide.color || []).join('・') || '-'}</span>
          <span>コスト: {activeSide.cost}</span>
          <span>{activeSide.reduction && activeSide.reduction.length ? `軽減: ${activeSide.reduction.join('・')}` : ''}</span>
          <span>カード種類: {activeSide.type}</span>
          <span>系統: {activeSide.tribe || '-'}</span>
          {activeSide.symbol && activeSide.symbol.length > 0 && (
            <span>シンボル: {activeSide.symbol.join('・')}</span>
          )}
        </div>
        {activeSide.levels && (
          <table className="cdm-level-table">
            <thead>
              <tr>
                <th style={cellStyle}></th>
                {activeSide.levels.map(l => (
                  <th key={l.level} style={cellStyle}>{l.level} ({l.cost})</th>
                ))}
                {card.ocBoost && (
                  <th className="oc-col" style={cellStyle}>OC({card.ocBoost.levelLabel.replace('OC', '')})</th>
                )}
                {(['ブレイヴ', '契約ブレイヴ'].includes(activeSide.type)) && activeSide.combinedBoost !== undefined && (
                  <th className="combined-col" style={cellStyle}>合体中</th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cellStyle}>BP</td>
                {activeSide.levels.map(l => (
                  <td key={l.level} style={cellStyle}>{l.bp ?? '-'}</td>
                ))}
                {card.ocBoost && (
                  <td className="oc-col" style={cellStyle}>{card.ocBoost.bp}</td>
                )}
                {(['ブレイヴ', '契約ブレイヴ'].includes(activeSide.type)) && activeSide.combinedBoost !== undefined && (
                  <td className="combined-col" style={cellStyle}>+{activeSide.combinedBoost}</td>
                )}
              </tr>
            </tbody>
          </table>
        )}
        <div className="cdm-meta">
          <span>レアリティ: {activeSide.rarity || '-'}</span>
          <span>収録弾: {getPackLabel(activeSide.pack) || '-'}</span>
          <span>カード番号: {activeSide.cardNumber || '-'}</span>
        </div>
        <div className="cdm-effect">
          {renderEffect(activeSide.effect)}
        </div>
      </div>
    </div>
  );
}

// エフェクトテキストのレンダリング（アルドノアドライブ、解封、導託、神託 のブロック装飾）
function renderEffect(effect) {
  if (!effect) return 'テキストなし';
  const lines = effect.split(/\r?\n/);
  const result = [];
  let i = 0;
  let foundAldnoah = false;
  while (i < lines.length) {
    if (!foundAldnoah && /^【アルドノアドライブ：/.test(lines[i])) {
      foundAldnoah = true;
      const rest = lines.slice(i);
      result.push(
        <div key={i} className="cdm-effect-aldnoah">
          {rest.map((line, idx) => (
            <span key={idx}>{line}{idx < rest.length - 1 ? <br /> : null}</span>
          ))}
        </div>
      );
      break;
    } else if (!foundAldnoah && /^【解封：/.test(lines[i])) {
      let start = i;
      let end = i + 1;
      while (end < lines.length && lines[end].trim() !== '') {
        if (/^【アルドノアドライブ：/.test(lines[end])) break;
        end++;
      }
      const block = lines.slice(start, end);
      result.push(
        <div key={i} className="cdm-effect-unseal">
          {block.map((line, idx) => (
            <span key={idx}>{line}{idx < block.length - 1 ? <br /> : null}</span>
          ))}
        </div>
      );
      i = end;
    } else if (!foundAldnoah && /^【(真・)?導託：/.test(lines[i])) {
      let start = i;
      let end = i + 1;
      while (end < lines.length && lines[end].trim() !== '') {
        if (/^【アルドノアドライブ：/.test(lines[end])) break;
        end++;
      }
      const block = lines.slice(start, end);
      result.push(
        <div key={i} className="cdm-effect-guide">
          {block.map((line, idx) => (
            <span key={idx}>{line}{idx < block.length - 1 ? <br /> : null}</span>
          ))}
        </div>
      );
      i = end;
    } else if (!foundAldnoah && /^【(真・)?神託：/.test(lines[i])) {
      let start = i;
      let end = i + 1;
      while (end < lines.length && lines[end].trim() !== '') {
        if (/^【アルドノアドライブ：/.test(lines[end])) break;
        end++;
      }
      const block = lines.slice(start, end);
      result.push(
        <div key={i} className="cdm-effect-oracle">
          {block.map((line, idx) => (
            <span key={idx}>{line}{idx < block.length - 1 ? <br /> : null}</span>
          ))}
        </div>
      );
      i = end;
    } else if (!foundAldnoah) {
      result.push(
        <span key={i}>{lines[i]}{i < lines.length - 1 ? <br /> : null}</span>
      );
      i++;
    } else {
      i++;
    }
  }
  return result;
}
