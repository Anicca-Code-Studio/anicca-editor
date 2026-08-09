import { describe, it, expect } from 'vitest';
import type { DocData } from './Model.js';
import { insertText, deleteRange, deleteBackward, deleteForward, splitBlock, mergeBlock, toggleMark, rangeHasMark, setBlockType, blockAt } from './Transaction.js';

function para(...texts: Array<{ text: string; marks?: string[] }>): DocData {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: texts.map(t => ({
          type: 'text' as const,
          text: t.text,
          ...(t.marks ? { marks: t.marks.map(m => ({ type: m })) } : {}),
        })),
      },
    ],
  };
}

const collapsed = (block: number, offset: number) => ({
  anchor: { block, offset },
  head: { block, offset },
});

const range = (b1: number, o1: number, b2: number, o2: number) => ({
  anchor: { block: b1, offset: o1 },
  head: { block: b2, offset: o2 },
});

function multi(...blocks: Array<{ type?: string; text: string; attrs?: Record<string, any> }>): DocData {
  return {
    type: 'doc',
    content: blocks.map(b => ({
      type: b.type ?? 'paragraph',
      ...(b.attrs ? { attrs: b.attrs } : {}),
      content: b.text ? [{ type: 'text' as const, text: b.text }] : [],
    })),
  };
}

describe('insertText', () => {
  it('inserts into the middle of a plain paragraph', () => {
    const doc = para({ text: 'Hello' });
    const res = insertText(doc, collapsed(0, 2), 'XX');
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'HeXXllo' }]);
    expect(res.sel).toEqual(collapsed(0, 4));
  });

  it('inserts into an empty paragraph', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    const res = insertText(doc, collapsed(0, 0), 'Hi');
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Hi' }]);
    expect(res.sel).toEqual(collapsed(0, 2));
  });

  it('inherits marks of the text node it lands inside', () => {
    const doc = para({ text: 'bold', marks: ['bold'] });
    const res = insertText(doc, collapsed(0, 2), 'X');
    expect(res.doc.content[0].content).toEqual([
      { type: 'text', text: 'boXld', marks: [{ type: 'bold' }] },
    ]);
    expect(res.sel).toEqual(collapsed(0, 3));
  });

  it('does not mutate the input doc', () => {
    const doc = para({ text: 'Hello' });
    const before = JSON.stringify(doc);
    insertText(doc, collapsed(0, 2), 'XX');
    expect(JSON.stringify(doc)).toEqual(before);
  });
});

describe('deleteRange', () => {
  it('deletes a range within one block', () => {
    const doc = para({ text: 'Hello' });
    const res = deleteRange(doc, range(0, 1, 0, 4));
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Ho' }]);
    expect(res.sel).toEqual(collapsed(0, 1));
  });

  it('deletes across blocks and merges them', () => {
    const doc = multi({ text: 'Hello' }, { text: 'World' });
    const res = deleteRange(doc, range(0, 3, 1, 2));
    expect(res.doc.content.length).toBe(1);
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Helrld' }]);
    expect(res.sel).toEqual(collapsed(0, 3));
  });
});

describe('deleteBackward', () => {
  it('deletes the char before a collapsed caret', () => {
    const doc = para({ text: 'Hello' });
    const res = deleteBackward(doc, collapsed(0, 3));
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Helo' }]);
    expect(res.sel).toEqual(collapsed(0, 2));
  });

  it('at block start merges into previous block', () => {
    const doc = multi({ text: 'Hello' }, { text: 'World' });
    const res = deleteBackward(doc, collapsed(1, 0));
    expect(res.doc.content.length).toBe(1);
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'HelloWorld' }]);
    expect(res.sel).toEqual(collapsed(0, 5));
  });

  it('at very start is a no-op', () => {
    const doc = para({ text: 'Hello' });
    const res = deleteBackward(doc, collapsed(0, 0));
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(res.sel).toEqual(collapsed(0, 0));
  });
});

describe('deleteForward', () => {
  it('deletes the char after a collapsed caret', () => {
    const doc = para({ text: 'Hello' });
    const res = deleteForward(doc, collapsed(0, 2));
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Helo' }]);
    expect(res.sel).toEqual(collapsed(0, 2));
  });

  it('at block end merges next block in', () => {
    const doc = multi({ text: 'Hello' }, { text: 'World' });
    const res = deleteForward(doc, collapsed(0, 5));
    expect(res.doc.content.length).toBe(1);
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'HelloWorld' }]);
    expect(res.sel).toEqual(collapsed(0, 5));
  });
});

describe('splitBlock', () => {
  it('splits a paragraph at the caret', () => {
    const doc = para({ text: 'Hello' });
    const res = splitBlock(doc, collapsed(0, 2));
    expect(res.doc.content.length).toBe(2);
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'He' }]);
    expect(res.doc.content[1].content).toEqual([{ type: 'text', text: 'llo' }]);
    expect(res.sel).toEqual(collapsed(1, 0));
  });

  it('splitting at end yields an empty new block', () => {
    const doc = para({ text: 'Hello' });
    const res = splitBlock(doc, collapsed(0, 5));
    expect(res.doc.content.length).toBe(2);
    expect(res.doc.content[1].content).toEqual([]);
    expect(res.sel).toEqual(collapsed(1, 0));
  });

  it('replaces a selected range before splitting', () => {
    const doc = para({ text: 'Hello' });
    const res = splitBlock(doc, range(0, 1, 0, 4));
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'H' }]);
    expect(res.doc.content[1].content).toEqual([{ type: 'text', text: 'o' }]);
    expect(res.sel).toEqual(collapsed(1, 0));
  });
});

describe('mergeBlock', () => {
  it('merges a block into the previous one', () => {
    const doc = multi({ text: 'Hello' }, { text: 'World' });
    const res = mergeBlock(doc, 1);
    expect(res.doc.content.length).toBe(1);
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'HelloWorld' }]);
    expect(res.sel).toEqual(collapsed(0, 5));
  });
});

describe('toggleMark', () => {
  it('adds a mark to a plain range', () => {
    const doc = para({ text: 'Hello' });
    const res = toggleMark(doc, range(0, 1, 0, 4), 'bold');
    expect(res.doc.content[0].content).toEqual([
      { type: 'text', text: 'H' },
      { type: 'text', text: 'ell', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'o' },
    ]);
    expect(res.sel).toEqual(range(0, 1, 0, 4));
  });

  it('removes the mark when the whole range already has it', () => {
    const doc = para({ text: 'Hello', marks: ['bold'] });
    const res = toggleMark(doc, range(0, 0, 0, 5), 'bold');
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('adds the mark when only part of the range has it', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'ab', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'cd' },
        ],
      }],
    };
    const res = toggleMark(doc, range(0, 0, 0, 4), 'bold');
    expect(res.doc.content[0].content).toEqual([
      { type: 'text', text: 'abcd', marks: [{ type: 'bold' }] },
    ]);
  });

  it('is a no-op on a collapsed selection', () => {
    const doc = para({ text: 'Hello' });
    const res = toggleMark(doc, collapsed(0, 2), 'bold');
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Hello' }]);
  });
});

describe('rangeHasMark', () => {
  it('true only when every char in the range has the mark', () => {
    const doc = para({ text: 'Hello', marks: ['bold'] });
    expect(rangeHasMark(doc, range(0, 0, 0, 5), 'bold')).toBe(true);
    expect(rangeHasMark(doc, range(0, 0, 0, 5), 'italic')).toBe(false);
  });
});

describe('setBlockType', () => {
  it('turns a paragraph into a heading with attrs', () => {
    const doc = para({ text: 'Title' });
    const res = setBlockType(doc, collapsed(0, 2), 'heading', { level: 2 });
    expect(res.doc.content[0].type).toBe('heading');
    expect(res.doc.content[0].attrs).toEqual({ level: 2 });
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'Title' }]);
    expect(res.sel).toEqual(collapsed(0, 2));
  });

  it('turns a heading back into a paragraph and drops attrs', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hi' }] }],
    };
    const res = setBlockType(doc, collapsed(0, 0), 'paragraph');
    expect(res.doc.content[0].type).toBe('paragraph');
    expect(res.doc.content[0].attrs).toBeUndefined();
  });

  it('applies to every block the selection touches', () => {
    const doc = multi({ text: 'a' }, { text: 'b' }, { text: 'c' });
    const res = setBlockType(doc, range(0, 0, 2, 1), 'heading', { level: 3 });
    expect(res.doc.content.map(b => b.type)).toEqual(['heading', 'heading', 'heading']);
  });

  it('strips marks when converting to a code_block', () => {
    const doc = para({ text: 'x', marks: ['bold'] });
    const res = setBlockType(doc, collapsed(0, 1), 'code_block');
    expect(res.doc.content[0].type).toBe('code_block');
    expect(res.doc.content[0].content).toEqual([{ type: 'text', text: 'x' }]);
  });
});

describe('blockAt', () => {
  it('returns the type and attrs of the block at the selection head', () => {
    const doc: DocData = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'H' }] },
      ],
    };
    expect(blockAt(doc, collapsed(1, 1))).toEqual({ type: 'heading', attrs: { level: 3 } });
    expect(blockAt(doc, collapsed(0, 0))).toEqual({ type: 'paragraph', attrs: undefined });
  });
});
