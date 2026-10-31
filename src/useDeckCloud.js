import { mutateDeckLibrary } from './useDeckLibrary';

export async function upsertCloudDeck(userId, deck, scope) {
  if (!userId) return false;
  try {
    await mutateDeckLibrary('save', scope, {
      name: deck.name, cards: deck.cards || [], token_deck: deck.tokenDeck || [],
      thumbnail_card_id: deck.thumbnailCardId ?? null,
    });
    return true;
  } catch (error) { alert('保存できませんでした: ' + error.message); return false; }
}
export async function deleteCloudDeck(userId, name, scope) {
  if (!userId) return false;
  try { await mutateDeckLibrary('delete', scope, { name }); return true; }
  catch (error) { alert('削除できませんでした: ' + error.message); return false; }
}
