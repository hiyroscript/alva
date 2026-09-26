// The credits, shown by the Home credits roll. Each group is a title, an
// optional lead line and plain lines.

import { CONFIG } from '../config.js';

export const CREDITS = [
  { title: CONFIG.title, lead: `Created by ${CONFIG.developer}` },
  {
    title: 'Original work',
    lines: [`Game design, code, interface, ${CONFIG.title} wordmark, and Desert / City stage artwork by ${CONFIG.developer}.`],
  },
  {
    title: '#0001 sprite source',
    lines: [
      'Original sprite material from Jump Ultimate Stars',
      'The Spriters Resource',
      'Source sheet uploaded by Dazz',
      'Contributor: FRET',
    ],
  },
  {
    title: 'Rights',
    lines: [
      `${CONFIG.developer} did not create or claim ownership of the original third-party character/game artwork.`,
      'Original characters, games, and related properties belong to their respective rights holders.',
    ],
  },
  { title: 'Project', lines: ['Unofficial fan project.', 'No affiliation or endorsement is implied.'] },
];
