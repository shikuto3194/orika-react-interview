export default function SavedDeckSort({ sortKey, direction, onSortKeyChange, onDirectionChange }) {
  return (
    <>
      <label className="saved-deck-filter-field">
        <span>並び替え</span>
        <select aria-label="並び替え項目" value={sortKey} onChange={event => onSortKeyChange(event.target.value)}>
          {[
            ['hit', 'ヒット度'], ['pack', '収録順'], ['name', '名前順'], ['created', '作成順'], ['updated', '更新順'],
          ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="saved-deck-filter-field">
        <span>順序</span>
        <select aria-label="並び替え方向" value={direction} onChange={event => onDirectionChange(event.target.value)}>
          <option value="desc">降順</option>
          <option value="asc">昇順</option>
        </select>
      </label>
    </>
  );
}
