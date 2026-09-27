// The credits, shown by the Home credits roll. Each group is a title, an
// optional lead line and plain lines, every one a translation key (or
// [key, params]; see js/core/i18n.js), so the roll follows the language.
// Proper names (Jump Ultimate Stars, The Spriters Resource, Dazz, FRET)
// stay as they are in every language.

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
  {
    title: 'credits.sprites2.title',
    lines: ['credits.sprites2.site'],
  },
  {
    title: 'credits.rights.title',
    lines: [['credits.rights.ownership', { developer }], 'credits.rights.holders'],
  },
  { title: 'credits.project.title', lines: ['credits.project.unofficial', 'credits.project.endorsement'] },
];

// A credit label as [key, params].
export const creditLabel = (spec) => (Array.isArray(spec) ? spec : [spec]);

// The credits as text in the active language: [{ title, lead, lines }].
export function creditsText() {
  const read = (spec) => t(...creditLabel(spec));
  return CREDITS.map((group) => ({
    title: read(group.title),
    lead: group.lead ? read(group.lead) : null,
    lines: (group.lines || []).map(read),
  }));
}
