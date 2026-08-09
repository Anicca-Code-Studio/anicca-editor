// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '../core/Editor.js';
import { InputRulesPlugin, matchBlockRule, matchInlineRule } from './InputRulesPlugin.js';

describe('matchBlockRule', () => {
  it('maps heading markers by hash count', () => {
    expect(matchBlockRule('#')).toEqual({ type: 'heading', attrs: { level: 1 }, markerLen: 1 });
    expect(matchBlockRule('###')).toEqual({ type: 'heading', attrs: { level: 3 }, markerLen: 3 });
  });
  it('maps blockquote, lists and code fence', () => {
    expect(matchBlockRule('>')).toEqual({ type: 'blockquote', attrs: undefined, markerLen: 1 });
    expect(matchBlockRule('-')).toEqual({ type: 'list_item', attrs: { kind: 'bullet' }, markerLen: 1 });
    expect(matchBlockRule('*')).toEqual({ type: 'list_item', attrs: { kind: 'bullet' }, markerLen: 1 });
    expect(matchBlockRule('1.')).toEqual({ type: 'list_item', attrs: { kind: 'ordered' }, markerLen: 2 });
    expect(matchBlockRule('```')).toEqual({ type: 'code_block', attrs: { language: '' }, markerLen: 3 });
  });
  it('ignores non-marker text', () => {
    expect(matchBlockRule('hello')).toBeNull();
    expect(matchBlockRule('#word')).toBeNull();
  });
});

describe('matchInlineRule', () => {
  it('detects a completed bold delimiter run', () => {
    // caret text so far is "**bold*", user types the final "*"
    expect(matchInlineRule('**bold*', '*')).toEqual({ markType: 'bold', inner: 'bold', matchLen: 8 });
  });
  it('detects italic, code and strikethrough', () => {
    expect(matchInlineRule('_x', '_')).toEqual({ markType: 'italic', inner: 'x', matchLen: 3 });
    expect(matchInlineRule('`y', '`')).toEqual({ markType: 'code', inner: 'y', matchLen: 3 });
    expect(matchInlineRule('~~z~', '~')).toEqual({ markType: 'strikethrough', inner: 'z', matchLen: 5 });
  });
  it('returns null when no delimiter closes', () => {
    expect(matchInlineRule('plain', 'x')).toBeNull();
  });
});

describe('InputRulesPlugin (integration)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  function caretAt(editable: HTMLElement, blockIdx: number, offset: number) {
    const block = editable.children[blockIdx];
    const textNode = block.firstChild ?? block;
    const range = document.createRange();
    range.setStart(textNode, offset);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  it('turns "# " into a heading and drops the marker', () => {
    const editor = new Editor({ attachTo: host, plugins: [InputRulesPlugin], data: '<p>#</p>' });
    const editable = editor.getEditable()!;
    caretAt(editable, 0, 1);

    const ev = new InputEvent('beforeinput', { inputType: 'insertText', data: ' ', cancelable: true });
    editable.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    const b = editor.getDoc().content[0];
    expect(b.type).toBe('heading');
    expect(b.attrs).toEqual({ level: 1 });
    expect(b.content).toEqual([]);
  });

  it('turns "**x*" + "*" into bold text', () => {
    const editor = new Editor({ attachTo: host, plugins: [InputRulesPlugin], data: '<p>**x*</p>' });
    const editable = editor.getEditable()!;
    caretAt(editable, 0, 4);

    const ev = new InputEvent('beforeinput', { inputType: 'insertText', data: '*', cancelable: true });
    editable.dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(editor.getDoc().content[0].content).toEqual([{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }]);
  });
});
