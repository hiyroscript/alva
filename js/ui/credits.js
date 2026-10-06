// The credits, shown by the Home credits roll. Each group is a title, an
// optional lead line and plain lines, every one a translation key (or
// [key, params]; see js/localization/i18n.js), so the roll follows the language.
// Proper names (Finhj, ZetrasBlack, R0B4N, thespriteanimations, DeviantArt)
// stay as they are in every language. A
// line may also link to its source:
// { label: key or [key, params], href }, the label still translated and
// the address never.

import { CONFIG } from '../config.js';
import { t } from '../localization/i18n.js';

const developer = CONFIG.developer;

// Where #0001's sprite sheet was published: its DeviantArt page, found by
// the deviation's number alone (the page's title is left out of the
// address: the character behind #0001 is never named).
const SPRITES_0001 = 'https://www.deviantart.com/finhj/art/1084627848';
// Where #0002's sprite sheet was published: its DeviantArt page, found by
// the deviation's number.
const SPRITES_0002 = 'https://www.deviantart.com/thespriteanimations/art/Sprite-Sheet-1350194762';

export const CREDITS = [
  { title: 'brand.title', lead: ['credits.createdBy', { developer }] },
  {
    title: 'credits.original.title',
    lines: [['credits.original.line', { title: CONFIG.title, developer }]],
  },
  // #0001's sheet, linked to where it was published, and the credits the
  // sheet itself gives.
  {
    title: 'credits.sprites0001.title',
    lines: [{ label: 'credits.sprites0001.sheet', href: SPRITES_0001 }, 'credits.sprites0001.sheetCredits'],
  },
  // #0002's sheet, linked to where it was published.
  {
    title: 'credits.sprites0002.title',
    lines: [{ label: 'credits.sprites0002.sheet', href: SPRITES_0002 }],
  },
  {
    title: 'credits.rights.title',
    lines: [['credits.rights.ownership', { developer }], 'credits.rights.holders'],
  },
  { title: 'credits.project.title', lines: ['credits.project.unofficial', 'credits.project.endorsement'] },
];

// A credit label as [key, params]; a linked line's own label.
export const creditLabel = (spec) => {
  const label = spec?.label ?? spec;
  return Array.isArray(label) ? label : [label];
};

// A credit line's link, or null.
export const creditLink = (spec) => spec?.href ?? null;

// The credits as text in the active language: [{ title, lead, lines }].
export function creditsText() {
  const read = (spec) => t(...creditLabel(spec));
  return CREDITS.map((group) => ({
    title: read(group.title),
    lead: group.lead ? read(group.lead) : null,
    lines: (group.lines || []).map(read),
  }));
}
