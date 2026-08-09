import { describe, it, expect } from 'vitest';
import { History } from './History.js';
import { collapsed } from './Position.js';
import type { DocData } from './Model.js';

function docWith(text: string): DocData {
  return { type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] };
}

const S = collapsed(0, 0);

describe('History (patch-based)', () => {
  it('records changes and undoes/redoes them', () => {
    const h = new History();
    const s0 = docWith('');
    const s1 = docWith('a');
    const s2 = docWith('ab');
    h.push(s0, s1, S, S);       // '' -> 'a'
    h.push(s1, s2, S, S);       // 'a' -> 'ab'
    expect(h.undo(s2)!.doc).toEqual(s1);
    expect(h.undo(s1)!.doc).toEqual(s0);
    expect(h.canUndo()).toBe(false);
    expect(h.redo(s0)!.doc).toEqual(s1);
  });

  it('coalesces consecutive typing into one undo step', () => {
    const h = new History();
    const s0 = docWith('');
    const s1 = docWith('a');
    const s2 = docWith('ab');
    h.push(s0, s1, S, S, true);
    h.push(s1, s2, S, S, true); // merged into the run
    const prev = h.undo(s2)!;
    expect(prev.doc).toEqual(s0);   // jumps straight back past the burst
    expect(h.canUndo()).toBe(false);
  });

  it('breakCoalescing forces the next typing push to be discrete', () => {
    const h = new History();
    h.push(docWith(''), docWith('a'), S, S, true);
    h.breakCoalescing();
    h.push(docWith('a'), docWith('ab'), S, S, true);
    expect(h.undo(docWith('ab'))!.doc).toEqual(docWith('a'));
    expect(h.undo(docWith('a'))!.doc).toEqual(docWith(''));
  });

  it('a new push clears the redo stack', () => {
    const h = new History();
    h.push(docWith(''), docWith('a'), S, S);
    h.undo(docWith('a'));
    expect(h.canRedo()).toBe(true);
    h.push(docWith(''), docWith('x'), S, S);
    expect(h.canRedo()).toBe(false);
  });

  it('restores the selection captured on each side of the change', () => {
    const h = new History();
    const selBefore = collapsed(0, 3);
    const selAfter = collapsed(0, 4);
    h.push(docWith('abc'), docWith('abcd'), selBefore, selAfter);
    const entry = h.undo(docWith('abcd'))!;
    expect(entry.sel).toEqual(selBefore);
    expect(entry.doc).toEqual(docWith('abc'));
    const back = h.redo(docWith('abc'))!;
    expect(back.sel).toEqual(selAfter);
    expect(back.doc).toEqual(docWith('abcd'));
  });

  it('caps the undo depth, dropping the oldest step', () => {
    const h = new History(3);
    for (let i = 0; i < 10; i++) h.push(docWith(String(i)), docWith(String(i + 1)), S, S);
    expect(h.depth).toBe(3);
  });

  it('stores patches, not whole-document snapshots (memory)', () => {
    // A long document with a single changed block must not retain the whole doc.
    const big = (mark: string): DocData => ({
      type: 'doc',
      content: Array.from({ length: 500 }, (_, i) => ({
        type: 'paragraph', content: [{ type: 'text', text: i === 250 ? mark : 'x' + i }],
      })),
    });
    const h = new History();
    h.push(big('a'), big('b'), S, S);
    // Reach into the single step and confirm it kept only the one changed block.
    const step = (h as any).undoStack[0];
    expect(step.patch.remove).toHaveLength(1);
    expect(step.patch.insert).toHaveLength(1);
  });
});
