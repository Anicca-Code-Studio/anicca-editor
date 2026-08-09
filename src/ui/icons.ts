// Inline SVG icons for the default toolbar. Each is a self-contained 20px svg
// that inherits the button text color via `currentColor`, so hover and active
// states recolor it for free. These strings are set as innerHTML on buttons the
// editor creates itself, so the markup is trusted (no user input).

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">${body}</svg>`;

const line = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  undo: line('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  redo: line('<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),

  bold: svg('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zm0 7h7a3.5 3.5 0 0 1 0 7H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  italic: line('<line x1="19" y1="5" x2="10" y2="5"/><line x1="14" y1="19" x2="5" y2="19"/><line x1="15" y1="5" x2="9" y2="19"/>'),
  underline: line('<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="21" x2="20" y2="21"/>'),
  strikethrough: line('<line x1="4" y1="12" x2="20" y2="12"/><path d="M7.5 7.5A4 4 0 0 1 11 5h2a4 4 0 0 1 4 4"/><path d="M8 15a4 4 0 0 0 4 3h1a4 4 0 0 0 3.5-2"/>'),
  code: line('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  superscript: svg('<text x="1" y="19" font-size="15" font-family="sans-serif">x</text><text x="14" y="10" font-size="10" font-family="sans-serif">2</text>'),
  subscript: svg('<text x="1" y="17" font-size="15" font-family="sans-serif">x</text><text x="14" y="22" font-size="10" font-family="sans-serif">2</text>'),

  textColor: svg('<path d="M5 17 9.5 6h1L15 17h-2l-1-2.6H8L7 17zm3.6-4.4h2.8L10 8.5z"/><rect x="4" y="19" width="16" height="3" rx="1"/>'),
  highlight: svg('<path d="M4 20h16v2H4z"/><path d="M6.5 16 14 8.5 15.5 10 8 17.5H6.5zM15 7.5 16.5 6a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1L18 10.5z"/>'),

  bulletList: line('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/>'),
  orderedList: line('<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><path d="M4 8V4l-1 1" stroke-width="1.6"/><path d="M3 12h2l-2 3h2" stroke-width="1.6"/>'),
  indent: line('<line x1="11" y1="6" x2="20" y2="6"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><polyline points="4 8 8 12 4 16"/>'),
  outdent: line('<line x1="11" y1="6" x2="20" y2="6"/><line x1="11" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><polyline points="8 8 4 12 8 16"/>'),

  link: line('<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>'),
  image: line('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5L5 20"/>'),
  video: line('<rect x="3" y="5" width="18" height="14" rx="2"/><polygon points="10 9 15 12 10 15" fill="currentColor" stroke="none"/>'),

  table: line('<rect x="3" y="4" width="18" height="16" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/>'),
  rowAdd: line('<rect x="3" y="4" width="18" height="6" rx="1"/><line x1="12" y1="14" x2="12" y2="20"/><line x1="9" y1="17" x2="15" y2="17"/>'),
  rowDelete: line('<rect x="3" y="4" width="18" height="6" rx="1"/><line x1="9" y1="17" x2="15" y2="17"/>'),
  colAdd: line('<rect x="4" y="3" width="6" height="18" rx="1"/><line x1="17" y1="9" x2="17" y2="15"/><line x1="14" y1="12" x2="20" y2="12"/>'),
  colDelete: line('<rect x="4" y="3" width="6" height="18" rx="1"/><line x1="14" y1="12" x2="20" y2="12"/>'),
  mergeCells: line('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M9 12h6"/><path d="m12 9-3 3 3 3M12 9l3 3-3 3" stroke-width="1.5"/>'),
  splitCells: line('<rect x="3" y="5" width="18" height="14" rx="1"/><line x1="12" y1="5" x2="12" y2="19"/>'),
  headerRow: line('<rect x="3" y="4" width="18" height="16" rx="1"/><rect x="3" y="4" width="18" height="5" fill="currentColor" stroke="none" opacity="0.35"/><line x1="3" y1="9" x2="21" y2="9"/>'),
  tableDelete: line('<rect x="3" y="4" width="18" height="16" rx="1"/><line x1="8" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="8" y2="15"/>'),
  caption: line('<rect x="3" y="5" width="18" height="11" rx="2"/><line x1="6" y1="20" x2="14" y2="20"/>'),

  quote: svg('<path d="M7 7c-2 0-3.5 1.6-3.5 3.6S5 14 6.7 14c.2 0 .4 0 .6-.1-.4 1.4-1.6 2.5-3 2.9l.5 1.6c2.8-.7 5-3.2 5-6.4C10.3 9 9 7 7 7zm9 0c-2 0-3.5 1.6-3.5 3.6S14 14 15.7 14c.2 0 .4 0 .6-.1-.4 1.4-1.6 2.5-3 2.9l.5 1.6c2.8-.7 5-3.2 5-6.4C19.3 9 18 7 16 7z"/>'),
  codeBlock: line('<rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="9 9 7 12 9 15"/><polyline points="15 9 17 12 15 15"/>'),

  alignLeft: line('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>'),
  alignCenter: line('<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/>'),
  alignRight: line('<line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="6" y1="18" x2="20" y2="18"/>'),
};

export type IconName = keyof typeof icons;
