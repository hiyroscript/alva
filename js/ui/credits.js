// The credits, shown by the Home credits roll. Each group is a title, an
// optional lead line and plain lines, every one a translation key (or
// [key, params]; see js/core/i18n.js), so the roll follows the language.
// Proper names (Jump Ultimate Stars, The Spriters Resource, Dazz, FRET,
// Dazz & Fret) stay as they are in every language. A line may also link to its source:
// { label: key or [key, params], href }, the label still translated and
// the address never.

import { CONFIG } from '../config.js';
import { t } from '../core/i18n.js';

const developer = CONFIG.developer;

export const CREDITS = [
  { title: 'brand.title', lead: ['credits.createdBy', { developer }] },
  {
    title: 'credits.original.title',
    lines: [['credits.original.line', { title: CONFIG.title, developer }]],
  },
  {
    title: 'credits.sprites.title',
    lines: [
      'credits.sprites.material',
      'credits.sprites.site',
      'credits.sprites.uploader',
      'credits.sprites.contributor',
    ],
  },
  // #0003's sheet names only the site and who ripped it, not its game.
  {
    title: 'credits.sprites0003.title',
    lines: ['credits.sprites0003.site', 'credits.sprites0003.rippers'],
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
