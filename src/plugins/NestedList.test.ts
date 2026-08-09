// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { indentListItem, outdentListItem, setBlockType } from '../core/Transaction.js';
import { serialize } from '../conversion/Serializer.js';
import { parse } from '../conversion/Parser.js';
import { defaultSchema } from '../core/Schema.js';
import type { DocData } from '../core/Model.js';
import { collapsed } from '../core/Position.js';

const li = (text: string, kind: 'bullet' | 'ordered', indent?: number) => ({
  type: 'list_item',
  attrs: { kind, ...(indent ? { indent } : {}) },
  content: [{ type: 'text', text }],
});
const doc = (content: any[]): DocData => ({ type: 'doc', content });

describe('nested list — indent / outdent ops', () => {
  it('indents an item one level under its predecessor', () => {
    const d = doc([li('a', 'bullet'), li('b', 'bullet')]);
    const out = indentListItem(d, collapsed(1, 0));
    expect(out.doc.content[1].attrs).toEqual({ kind: 'bullet', indent: 1 });
  });

  it('cannot indent the first item (no predecessor)', () => {
    const d = doc([li('a', 'bullet'), li('b', 'bullet')]);
    const out = indentListItem(d, collapsed(0, 0));
    expect(out.doc.content[0].attrs?.indent ?? 0).toBe(0);
  });

  it('cannot indent deeper than predecessor + 1', () => {
    const d = doc([li('a', 'bullet'), li('b', 'bullet')]);
    let out = indentListItem(d, collapsed(1, 0)); // b -> 1
    out = indentListItem(out.doc, collapsed(1, 0)); // still 1 (pred a is 0)
    expect(out.doc.content[1].attrs?.indent).toBe(1);
  });

  it('outdent decreases and drops indent attr at level 0', () => {
    const d = doc([li('a', 'bullet'), li('b', 'bullet', 1)]);
    const out = outdentListItem(d, collapsed(1, 0));
    expect(out.doc.content[1].attrs).toEqual({ kind: 'bullet' });
    expect('indent' in (out.doc.content[1].attrs ?? {})).toBe(false);
  });

  it('is a no-op on a non-list block', () => {
    const d = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }]);
    expect(indentListItem(d, collapsed(0, 0)).doc).toEqual(d);
  });
});

describe('nested list — serialize', () => {
  it('nests a deeper item inside its parent li', () => {
    const d = doc([li('a', 'bullet'), li('b', 'bullet', 1), li('c', 'bullet', 1), li('d', 'bullet')]);
    expect(serialize(d)).toBe('<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>');
  });

  it('keeps a flat single-level list unchanged (backwards compatible)', () => {
    const d = doc([li('a', 'bullet'), li('b', 'bullet')]);
    expect(serialize(d)).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('nests a different kind at the deeper level', () => {
    const d = doc([li('a', 'bullet'), li('b', 'ordered', 1)]);
    expect(serialize(d)).toBe('<ul><li>a<ol><li>b</li></ol></li></ul>');
  });

  it('handles three levels', () => {
    const d = doc([li('a', 'bullet'), li('b', 'bullet', 1), li('c', 'bullet', 2), li('d', 'bullet')]);
    expect(serialize(d)).toBe('<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul>');
  });
});

describe('nested list — parse round-trip', () => {
  it('reads nested <ul> into flat items with indent', () => {
    const doc0 = parse('<ul><li>a<ul><li>b</li></ul></li></ul>');
    expect(doc0.content).toEqual([
      { type: 'list_item', attrs: { kind: 'bullet' }, content: [{ type: 'text', text: 'a' }] },
      { type: 'list_item', attrs: { kind: 'bullet', indent: 1 }, content: [{ type: 'text', text: 'b' }] },
    ]);
  });

  it('round-trips a 2-level nested list through the schema', () => {
    const html = '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>';
    expect(serialize(defaultSchema.normalize(parse(html)))).toBe(html);
  });
});

describe('nested list — schema clamps indent jumps', () => {
  it('clamps an item that jumps more than one level below its predecessor', () => {
    const d = doc([li('a', 'bullet'), li('b', 'bullet', 5)]);
    const n = defaultSchema.normalize(d);
    expect(n.content[1].attrs?.indent).toBe(1);
  });

  it('forces the first list item to level 0', () => {
    const d = doc([li('a', 'bullet', 3)]);
    const n = defaultSchema.normalize(d);
    expect(n.content[0].attrs?.indent ?? 0).toBe(0);
  });
});
