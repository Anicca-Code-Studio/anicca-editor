import { Plugin } from './Plugin.js';
import type { Editor } from '../core/Editor.js';
import {
  deleteRange, setBlockType, insertText, toggleMark, blockText,
} from '../core/Transaction.js';
import { selCollapsed } from '../core/Position.js';

export interface BlockRuleMatch {
  type: string;
  attrs: Record<string, any> | undefined;
  markerLen: number;
}

export interface InlineRuleMatch {
  markType: string;
  inner: string;
  matchLen: number;
}

// Block rules fire when the text before the caret is *exactly* a marker and the
// user types a space: `#`..`######`, `>`, `-`/`*`, `1.`, ```` ``` ````.
export function matchBlockRule(textBefore: string): BlockRuleMatch | null {
  const heading = textBefore.match(/^(#{1,6})$/);
  if (heading) return { type: 'heading', attrs: { level: heading[1].length }, markerLen: heading[1].length };
  if (textBefore === '>') return { type: 'blockquote', attrs: undefined, markerLen: 1 };
  if (textBefore === '-' || textBefore === '*') return { type: 'list_item', attrs: { kind: 'bullet' }, markerLen: 1 };
  if (/^\d+\.$/.test(textBefore)) return { type: 'list_item', attrs: { kind: 'ordered' }, markerLen: textBefore.length };
  if (textBefore === '```') return { type: 'code_block', attrs: { language: '' }, markerLen: 3 };
  return null;
}

// Inline rules fire when a delimiter run closes: the char just typed (`data`)
// completes `**bold**`, `*em*`/`_em_`, `` `code` ``, or `~~strike~~`.
const INLINE_PATTERNS: Array<{ re: RegExp; markType: string }> = [
  { re: /\*\*([^*\n]+)\*\*$/, markType: 'bold' },
  { re: /~~([^~\n]+)~~$/, markType: 'strikethrough' },
  { re: /(?:^|[^*])\*([^*\n]+)\*$/, markType: 'italic' },
  { re: /(?:^|[^_])_([^_\n]+)_$/, markType: 'italic' },
  { re: /`([^`\n]+)`$/, markType: 'code' },
];

export function matchInlineRule(textBefore: string, data: string): InlineRuleMatch | null {
  const candidate = textBefore + data;
  for (const { re, markType } of INLINE_PATTERNS) {
    const m = candidate.match(re);
    if (m) {
      // The delimiter run that actually belongs to the rule. The guarded
      // patterns ("(?:^|[^*])") may capture a leading guard char that is not
      // part of the run, so drop it unless m[0] itself starts with a delimiter.
      const full = /^[*_`~]/.test(m[0]) ? m[0] : m[0].slice(1);
      return { markType, inner: m[1], matchLen: full.length };
    }
  }
  return null;
}

export class InputRulesPlugin extends Plugin {
  static readonly pluginName = 'InputRules';

  init(): void {
    this.editor.registerInputHandler((e, editor) => this._handle(e, editor));
  }

  private _handle(e: InputEvent, editor: Editor): boolean {
    if (e.inputType !== 'insertText' || e.data == null) return false;
    const sel = editor.getSelectionModel();
    if (!selCollapsed(sel)) return false;

    const head = sel.head;
    const textBefore = blockText(editor.getDoc(), head).slice(0, head.offset);

    if (e.data === ' ') {
      const rule = matchBlockRule(textBefore);
      if (rule) {
        editor.applyOp((doc, s) => {
          const del = deleteRange(doc, { anchor: { ...s.head, offset: 0 }, head: { ...s.head, offset: rule.markerLen } });
          return setBlockType(del.doc, del.sel, rule.type, rule.attrs);
        });
        return true;
      }
    }

    const inline = matchInlineRule(textBefore, e.data);
    if (inline) {
      editor.applyOp((doc, s) => {
        const from = { ...s.head, offset: s.head.offset - (inline.matchLen - 1) };
        const del = deleteRange(doc, { anchor: from, head: s.head });
        const ins = insertText(del.doc, del.sel, inline.inner);
        const start = del.sel.head;
        const end = { ...start, offset: start.offset + inline.inner.length };
        const marked = toggleMark(ins.doc, { anchor: start, head: end }, inline.markType);
        return { doc: marked.doc, sel: { anchor: end, head: end } };
      });
      return true;
    }

    return false;
  }
}
