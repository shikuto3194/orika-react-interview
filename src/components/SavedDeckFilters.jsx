import { useId } from 'react';
import { DECK_FILTER_LABELS } from '../utils/savedDeckFilters';
import { getPackLabel } from '../utils/deckPacks';
import '../styles/saved-deck-filters.css';

export default function SavedDeckFilters({ filters, options, onChange, children }) {
  const id = useId();
  return (
    <div className="saved-deck-filters">
      {Object.entries(DECK_FILTER_LABELS).map(([field, label]) => {
        const searchable = field === 'tribe' || field === 'contract';
        const choices = options[field];
        const displayValue = value => field === 'pack' ? getPackLabel(value) : value;
        return (
          <label key={field} className="saved-deck-filter-field">
            <span>{label}</span>
            {searchable ? (
              <>
                <input type="search" list={`${id}-${field}`} aria-label={`デッキの${label}`} placeholder="指定なし・入力で検索"
                  value={filters[field]} onChange={event => onChange({ ...filters, [field]: event.target.value })} />
                <datalist id={`${id}-${field}`}>
                  {choices.map(option => <option key={option.value} value={option.value}>{option.count}デッキ</option>)}
                </datalist>
              </>
            ) : (
              <select aria-label={`デッキの${label}`} value={filters[field]} onChange={event => onChange({ ...filters, [field]: event.target.value })}>
                <option value="">指定なし</option>
                {filters[field] && !choices.some(option => option.value === filters[field]) && <option value={filters[field]}>{displayValue(filters[field])}（0デッキ）</option>}
                {choices.map(option => <option key={option.value} value={option.value}>{displayValue(option.value)}（{option.count}デッキ）</option>)}
              </select>
            )}
          </label>
        );
      })}
      {children}
    </div>
  );
}
