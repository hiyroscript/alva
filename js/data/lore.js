// Lore: ordered editorial entries for Discover, separate from navigation
// and gameplay. Titles and copy live in both localization tables. Add an
// entry here to extend the page; narrative claims need a project source.
// The repository currently establishes no world history or character stories,
// so these introductions promise no canonical events, origins or relationships.
export const LORE_ENTRIES = Object.freeze([
  Object.freeze({ id: 'world', titleKey: 'lore.world.title', textKey: 'lore.world.text' }),
  Object.freeze({ id: 'fighters', titleKey: 'lore.fighters.title', textKey: 'lore.fighters.text' }),
]);
