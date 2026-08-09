// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sliceSelection, insertFragment } from './Transaction.js';
import { sanitizeFragment } from './sanitize.js';
import { normalizePastedHtml, pasteToFragment, textToFragment } from './clipboard.js';
import type { DocData } from './Model.js';

const doc3: DocData = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'brave' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'World' }] },
  ],
};

describe('sliceSelection', () => {
  it('slices a partial range inside one block', () => {
    const sel = { anchor: { block: 0, offset: 1 }, head: { block: 0, offset: 4 } };
    const frag = sliceSelection(doc3, sel);
    expect(frag.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'ell' }] }]);
  });

  it('slices across blocks keeping partial ends', () => {
    const sel = { anchor: { block: 0, offset: 3 }, head: { block: 2, offset: 2 } };
    const frag = sliceSelection(doc3, sel);
    expect(frag.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'lo' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'brave' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Wo' }] },
    ]);
  });

  it('returns empty for a collapsed selection', () => {
    const frag = sliceSelection(doc3, { anchor: { block: 0, offset: 1 }, head: { block: 0, offset: 1 } });
    expect(frag.content).toEqual([]);
  });
});

describe('insertFragment', () => {
  it('inserts a single-block fragment inline at the caret', () => {
    const base: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'axb' }] }] };
    const frag: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'YY' }] }] };
    const sel = { anchor: { block: 0, offset: 2 }, head: { block: 0, offset: 2 } };
    const out = insertFragment(base, sel, frag);
    expect(out.doc.content[0].content).toEqual([{ type: 'text', text: 'axYYb' }]);
    expect(out.sel.head).toEqual({ block: 0, offset: 4 });
  });

  it('splits the block for a multi-block fragment', () => {
    const base: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'axb' }] }] };
    const frag: DocData = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'ONE' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'TWO' }] },
      ],
    };
    const sel = { anchor: { block: 0, offset: 2 }, head: { block: 0, offset: 2 } };
    const out = insertFragment(base, sel, frag);
    expect(out.doc.content.map(b => b.content)).toEqual([
      [{ type: 'text', text: 'axONE' }],
      [{ type: 'text', text: 'TWOb' }],
    ]);
    expect(out.sel.head).toEqual({ block: 1, offset: 3 });
  });

  it('replaces the selected range before inserting', () => {
    const base: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abcd' }] }] };
    const frag: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X' }] }] };
    const sel = { anchor: { block: 0, offset: 1 }, head: { block: 0, offset: 3 } };
    const out = insertFragment(base, sel, frag);
    expect(out.doc.content[0].content).toEqual([{ type: 'text', text: 'aXd' }]);
  });
});

describe('sanitizeFragment', () => {
  it('drops script and event-handler attributes', () => {
    const dirty = '<p onclick="evil()">hi</p><script>alert(1)</script>';
    const clean = sanitizeFragment(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).toMatch(/hi/);
  });

  it('neutralizes javascript: hrefs but keeps safe links', () => {
    const clean = sanitizeFragment('<a href="javascript:evil()">x</a><a href="https://ok.com">y</a>');
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toMatch(/https:\/\/ok\.com/);
  });
});

describe('normalizePastedHtml (Word / Google Docs cruft)', () => {
  it('strips MS Office conditional comments and o:p tags', () => {
    const word = '<!--[if gte mso 9]><xml>junk</xml><![endif]--><p class="MsoNormal">Text<o:p></o:p></p>';
    const out = normalizePastedHtml(word);
    expect(out).not.toMatch(/mso/i);
    expect(out).not.toMatch(/o:p/i);
    expect(out).toMatch(/Text/);
  });

  it('produces a clean model doc from Word-flavored html', () => {
    const word = '<p class="MsoNormal" style="mso-margin:0">Hello<o:p></o:p></p>';
    const frag = pasteToFragment(word);
    expect(frag.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]);
  });
});

describe('textToFragment', () => {
  it('splits plain text on newlines into paragraphs', () => {
    const frag = textToFragment('a\nb');
    expect(frag.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
    ]);
  });
});
