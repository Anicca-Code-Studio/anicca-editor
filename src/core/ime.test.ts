// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from './Editor.js';
import { replaceBlockInlines } from './Transaction.js';
import { parseInlineContent } from '../conversion/Parser.js';
import type { DocData } from './Model.js';

describe('replaceBlockInlines', () => {
  it('swaps a block inline content but keeps its type and attrs', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'old' }] }],
    };
    const next = replaceBlockInlines(doc, { block: 0, offset: 0 }, [{ type: 'text', text: 'new' }]);
    expect(next.content[0].type).toBe('heading');
    expect(next.content[0].attrs).toEqual({ level: 3 });
    expect(next.content[0].content).toEqual([{ type: 'text', text: 'new' }]);
  });

  it('flattens marks away inside a code_block', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'code_block', attrs: { language: '' }, content: [] }] };
    const next = replaceBlockInlines(doc, { block: 0, offset: 0 }, [
      { type: 'text', text: 'x', marks: [{ type: 'bold' }] },
    ]);
    expect(next.content[0].content).toEqual([{ type: 'text', text: 'x' }]);
  });
});

describe('parseInlineContent', () => {
  it('reads an element inline children into text nodes with marks', () => {
    const el = document.createElement('p');
    el.innerHTML = 'a<strong>b</strong>';
    const inlines = parseInlineContent(el);
    expect(inlines).toEqual([
      { type: 'text', text: 'a', marks: undefined },
      { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
    ]);
  });
});

describe('Editor IME + input hook', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('resyncs only the composed block, keeping other blocks intact', () => {
    const editor = new Editor({ attachTo: host, data: '<p>foo</p><p>bar</p>' });
    const editable = editor.getEditable()!;

    // Simulate an IME committing "X" into the first paragraph.
    const firstP = editable.querySelectorAll('p')[0];
    firstP.firstChild!.textContent = 'fooX';
    // put the caret in the composed block
    const range = document.createRange();
    range.setStart(firstP.firstChild!, 4);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    editable.dispatchEvent(new Event('compositionstart'));
    editable.dispatchEvent(new Event('compositionend'));

    const doc = editor.getDoc();
    expect(doc.content[0].content).toEqual([{ type: 'text', text: 'fooX' }]);
    expect(doc.content[1].content).toEqual([{ type: 'text', text: 'bar' }]);
  });

  it('lets a registered input handler intercept beforeinput', () => {
    const editor = new Editor({ attachTo: host, data: '<p>hi</p>' });
    const editable = editor.getEditable()!;
    let seen: string | null = null;
    editor.registerInputHandler((e) => {
      if (e.inputType === 'insertText' && e.data === '!') { seen = e.data; return true; }
      return false;
    });

    const ev = new InputEvent('beforeinput', { inputType: 'insertText', data: '!', cancelable: true });
    editable.dispatchEvent(ev);
    expect(seen).toBe('!');
    expect(ev.defaultPrevented).toBe(true);
  });
});
