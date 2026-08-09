import { describe, it, expect } from 'vitest';
import { diffDoc, applyPatch, invertPatch, isEmptyPatch } from './patch.js';
import type { DocData, BlockNodeData } from './Model.js';

const doc = (content: BlockNodeData[]): DocData => ({ type: 'doc', content });
const p = (text: string): BlockNodeData => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });

describe('patch — diff / apply / invert', () => {
  it('apply(before, diff) reproduces after; invert reverses it', () => {
    const before = doc([p('a'), p('b'), p('c')]);
    const after = doc([p('a'), p('X'), p('c')]);
    const patch = diffDoc(before, after);
    expect(applyPatch(before, patch)).toEqual(after);
    expect(applyPatch(after, invertPatch(patch))).toEqual(before);
  });

  it('captures only the changed block (minimal middle span)', () => {
    const before = doc([p('a'), p('b'), p('c')]);
    const after = doc([p('a'), p('B'), p('c')]);
    const patch = diffDoc(before, after);
    expect(patch.index).toBe(1);
    expect(patch.remove).toEqual([p('b')]);
    expect(patch.insert).toEqual([p('B')]);
  });

  it('handles a pure insertion', () => {
    const before = doc([p('a'), p('c')]);
    const after = doc([p('a'), p('b'), p('c')]);
    const patch = diffDoc(before, after);
    expect(patch.remove).toEqual([]);
    expect(patch.insert).toEqual([p('b')]);
    expect(applyPatch(before, patch)).toEqual(after);
    expect(applyPatch(after, invertPatch(patch))).toEqual(before);
  });

  it('handles a pure deletion', () => {
    const before = doc([p('a'), p('b'), p('c')]);
    const after = doc([p('a'), p('c')]);
    const patch = diffDoc(before, after);
    expect(patch.insert).toEqual([]);
    expect(patch.remove).toEqual([p('b')]);
    expect(applyPatch(before, patch)).toEqual(after);
    expect(applyPatch(after, invertPatch(patch))).toEqual(before);
  });

  it('an unchanged document yields an empty patch', () => {
    const d = doc([p('a'), p('b')]);
    expect(isEmptyPatch(diffDoc(d, d))).toBe(true);
    expect(applyPatch(d, diffDoc(d, d))).toEqual(d);
  });

  it('round-trips a batch of random block edits', () => {
    const rnd = (n: number) => Math.floor(Math.random() * n);
    for (let iter = 0; iter < 200; iter++) {
      const before = doc(Array.from({ length: rnd(6) }, (_, i) => p('b' + i)));
      const after = doc(Array.from({ length: rnd(6) }, (_, i) => p('a' + i)));
      const patch = diffDoc(before, after);
      expect(applyPatch(before, patch)).toEqual(after);
      expect(applyPatch(after, invertPatch(patch))).toEqual(before);
    }
  });
});
