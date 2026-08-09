// Clipboard helpers: turn pasted HTML/text into a model fragment, and clean
// the vendor cruft (Microsoft Word, Google Docs) that real-world pastes carry.
// The pipeline is: normalize cruft -> sanitize to the allowlist -> parse to
// model. Copy uses the Serializer directly (see Editor).

import type { DocData, BlockNodeData } from './Model.js';
import { parse } from '../conversion/Parser.js';
import { sanitizeFragment } from './sanitize.js';

/**
 * Strip Microsoft Office / Google Docs artifacts from pasted HTML: conditional
 * comments, <o:p>/<w:*>/<xml> tags, `mso-*` style properties, and `Mso*`
 * classes. Structure and real content are left untouched.
 */
export function normalizePastedHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')                 // comments incl. MS conditionals
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')            // Office <xml> islands
    .replace(/<\/?(?:o:p|o:office|w:[^\s>]*|xml)[^>]*>/gi, '') // office tags
    .replace(/mso-[a-z-]+:[^;"']*;?/gi, '')          // mso-* style props
    .replace(/\sclass="Mso[^"]*"/gi, '')             // MsoNormal etc.
    .replace(/\sclass='Mso[^']*'/gi, '');
}

/** Full paste pipeline: normalize -> sanitize -> parse into a model fragment. */
export function pasteToFragment(html: string): DocData {
  return parse(sanitizeFragment(normalizePastedHtml(html)));
}

/** Plain-text paste: each line becomes its own paragraph. */
export function textToFragment(text: string): DocData {
  const lines = text.split(/\r?\n/);
  const content: BlockNodeData[] = lines.map(line => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }));
  return { type: 'doc', content };
}

/** Flatten a fragment's text back to plain text (for the text/plain clipboard slot). */
export function fragmentText(frag: DocData): string {
  const lineOf = (block: BlockNodeData): string =>
    (block.content ?? [])
      .map(n => (n.type === 'text' ? (n as { text: string }).text : lineOf(n as BlockNodeData)))
      .join('');
  return frag.content.map(lineOf).join('\n');
}
