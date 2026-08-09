import { describe, it, expect } from 'vitest';
import { Change, transform, applyChange, changeFromPatch, replaceChange, Collab } from './collab.js';
import { diffDoc } from './patch.js';
import type { DocData, BlockNodeData } from './Model.js';

const blk = (tag: string): BlockNodeData => ({ type: 'paragraph', content: [{ type: 'text', text: tag }] });
const doc = (tags: string[]): DocData => ({ type: 'doc', content: tags.map(blk) });
const tags = (d: DocData) => d.content.map(b => (b.content?.[0] as any)?.text ?? '');

// Every replace on a doc of length `len`: each delete range and 0..2 inserted
// blocks carrying a caller-unique prefix so ordering differences surface.
function allReplaces(len: number, prefix: string): Change[] {
  const out: Change[] = [];
  for (let index = 0; index <= len; index++)
    for (let removeCount = 0; removeCount <= len - index; removeCount++)
      for (let ins = 0; ins <= 2; ins++)
        out.push(replaceChange(index, removeCount, Array.from({ length: ins }, (_, i) => blk(prefix + i))));
  return out;
}

describe('collab transform — TP1 convergence (exhaustive)', () => {
  it('converges for every concurrent replace pair on docs up to length 4', () => {
    let checked = 0;
    for (let len = 0; len <= 4; len++) {
      const base = doc(Array.from({ length: len }, (_, i) => 'x' + i));
      const A = allReplaces(len, 'A');
      const B = allReplaces(len, 'B');
      for (const a of A) {
        const afterA = applyChange(base, a);
        for (const b of B) {
          const afterB = applyChange(base, b);
          const path1 = applyChange(afterB, transform(a, b, 'left'));
          const path2 = applyChange(afterA, transform(b, a, 'right'));
          expect(path1).toEqual(path2);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('collab Collab client', () => {
  it('rebases local unconfirmed changes when a remote change arrives, converging both peers', () => {
    const base = doc(['a', 'b', 'c']);
    const op1 = replaceChange(1, 0, [blk('P')]);   // peer 1 inserts P at 1
    const op2 = replaceChange(3, 0, [blk('Q')]);   // peer 2 inserts Q at end

    const c1 = new Collab(1);
    const c2 = new Collab(2);
    let d1 = applyChange(base, op1); c1.local(op1);
    let d2 = applyChange(base, op2); c2.local(op2);

    d2 = applyChange(d2, c2.receive(op1, 1));
    d1 = applyChange(d1, c1.receive(op2, 2));

    expect(d1).toEqual(d2);
    expect(tags(d1)).toEqual(['a', 'P', 'b', 'c', 'Q']);
  });

  it('converges under a randomized two-peer relay of concurrent edits', () => {
    const rnd = (n: number) => Math.floor(Math.random() * n);
    for (let trial = 0; trial < 100; trial++) {
      const base = doc(['a', 'b', 'c', 'd']);
      const c1 = new Collab(1);
      const c2 = new Collab(2);

      const mk = (p: string): Change => {
        const index = rnd(base.content.length + 1);
        const removeCount = rnd(base.content.length - index + 1);
        const ins = rnd(3);
        return replaceChange(index, removeCount, Array.from({ length: ins }, (_, i) => blk(p + trial + i)));
      };
      const op1 = mk('P');
      const op2 = mk('Q');
      let d1 = applyChange(base, op1); c1.local(op1);
      let d2 = applyChange(base, op2); c2.local(op2);

      d2 = applyChange(d2, c2.receive(op1, 1));
      d1 = applyChange(d1, c1.receive(op2, 2));

      expect(d1).toEqual(d2);
    }
  });
});

describe('collab change from history patch', () => {
  it('derives an applicable change from a diff', () => {
    const before = doc(['a', 'b']);
    const after = doc(['a', 'X', 'b']);
    const change = changeFromPatch(diffDoc(before, after));
    expect(applyChange(before, change)).toEqual(after);
  });
});
