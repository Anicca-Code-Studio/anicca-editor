import { Plugin } from './Plugin.js';
import { blockText, deleteRange, insertText, toggleMark } from '../core/Transaction.js';
import { collapsed } from '../core/Position.js';
import { cloneDoc } from '../core/Model.js';
import type { DocData } from '../core/Model.js';

export interface Match {
  block: number;
  from: number;
  to: number;
}

/** All occurrences of `query` across top-level blocks, in document order. */
export function findMatches(doc: DocData, query: string, caseSensitive = false): Match[] {
  if (!query) return [];
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: Match[] = [];
  for (let block = 0; block < doc.content.length; block++) {
    const raw = blockText(doc, { block, offset: 0 });
    const hay = caseSensitive ? raw : raw.toLowerCase();
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      out.push({ block, from: idx, to: idx + query.length });
      idx = hay.indexOf(needle, idx + query.length);
    }
  }
  return out;
}

function replaceMatch(doc: DocData, m: Match, replacement: string): DocData {
  const del = deleteRange(doc, {
    anchor: { block: m.block, offset: m.from },
    head: { block: m.block, offset: m.to },
  });
  return insertText(del.doc, del.sel, replacement).doc;
}

/** Replace every occurrence of `query` with `replacement`. */
export function replaceAll(doc: DocData, query: string, replacement: string, caseSensitive = false): DocData {
  const matches = findMatches(doc, query, caseSensitive);
  let out = doc;
  // Apply from the last match backward so earlier offsets stay valid even when
  // the replacement changes the text length.
  for (let i = matches.length - 1; i >= 0; i--) {
    out = replaceMatch(out, matches[i], replacement);
  }
  return out;
}

/** A copy of the document with each match wrapped in a `highlight` mark. */
export function highlightDoc(doc: DocData, matches: Match[]): DocData {
  let out = cloneDoc(doc);
  // Marks do not change character offsets, so match ranges stay valid as we go.
  for (const m of matches) {
    out = toggleMark(out, {
      anchor: { block: m.block, offset: m.from },
      head: { block: m.block, offset: m.to },
    }, 'highlight').doc;
  }
  return out;
}

// Find & replace exposed as an API (like CKEditor / Quill modules). A host app
// wires it to its own search bar; the editor supplies the model operations and
// a non-destructive highlight preview.
export class FindReplacePlugin extends Plugin {
  static readonly pluginName = 'FindReplace';

  private _query = '';
  private _matches: Match[] = [];
  private _current = 0;
  private _caseSensitive = false;

  init(): void {
    // Clearing the preview when the document changes underneath a search keeps
    // stale highlights from lingering.
    this.editor.on('change', () => { if (this._query) this._matches = findMatches(this.editor.getDoc(), this._query, this._caseSensitive); });
  }

  /** Search and preview highlighted matches. Returns the match count. */
  find(query: string, caseSensitive = false): number {
    this._query = query;
    this._caseSensitive = caseSensitive;
    this._matches = findMatches(this.editor.getDoc(), query, caseSensitive);
    this._current = 0;
    this._renderPreview();
    return this._matches.length;
  }

  get matchCount(): number { return this._matches.length; }
  get currentIndex(): number { return this._current; }

  next(): void {
    if (this._matches.length === 0) return;
    this._current = (this._current + 1) % this._matches.length;
  }

  prev(): void {
    if (this._matches.length === 0) return;
    this._current = (this._current - 1 + this._matches.length) % this._matches.length;
  }

  /** Replace the current match and re-search. */
  replaceCurrent(replacement: string): void {
    const m = this._matches[this._current];
    if (!m) return;
    this.editor.applyOp((doc, sel) => ({ doc: replaceMatch(doc, m, replacement), sel }));
    this._matches = findMatches(this.editor.getDoc(), this._query, this._caseSensitive);
    if (this._current >= this._matches.length) this._current = 0;
    this._renderPreview();
  }

  /** Replace every match in one undoable step. */
  replaceAll(query: string, replacement: string, caseSensitive = false): void {
    this.editor.applyOp((doc) => ({ doc: replaceAll(doc, query, replacement, caseSensitive), sel: collapsed(0, 0) }));
    this.clear();
  }

  /** Remove highlights and reset the search. */
  clear(): void {
    this._query = '';
    this._matches = [];
    this._current = 0;
    this.editor.previewDoc(this.editor.getDoc());
  }

  private _renderPreview(): void {
    if (!this._query || this._matches.length === 0) {
      this.editor.previewDoc(this.editor.getDoc());
      return;
    }
    this.editor.previewDoc(highlightDoc(this.editor.getDoc(), this._matches));
  }
}
