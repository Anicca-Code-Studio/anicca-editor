// Collaboration: convergent block-level Operational Transform over the document.
//
// A change is a list of primitive block-array operations — insert(pos, items)
// and delete(pos, count) — applied left to right (each prim's positions are in
// the coordinate space after the previous prims in the same change). Every edit
// the editor makes is a "replace" (delete then insert at one index), which maps
// to such a change. `transform(a, b, side)` rebases change `a` so it applies
// after a concurrent change `b`, with a deterministic `side` tie-break.
//
// Core guarantee (TP1), verified exhaustively in the tests over every replace
// pair on documents up to length 4:
//
//   applyChange(applyChange(doc, b), transform(a, b, 'left'))
//     === applyChange(applyChange(doc, a), transform(b, a, 'right'))
//
// so two peers that each see the other's change converge to an identical
// document, with no corruption. This is block-granularity OT: two peers editing
// the *same* block concurrently converge by the tie-break (one edit wins over
// the other's) rather than merging character by character.

import type { DocData, BlockNodeData } from './Model.js';
import type { Patch } from './patch.js';

export type Prim =
  | { t: 'ins'; pos: number; items: BlockNodeData[] }
  | { t: 'del'; pos: number; count: number };

export type Change = Prim[];
export type Side = 'left' | 'right';

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function opposite(s: Side): Side {
  return s === 'left' ? 'right' : 'left';
}

/** A replace as a primitive change: delete `removeCount` at `index`, insert. */
export function replaceChange(index: number, removeCount: number, insert: BlockNodeData[]): Change {
  const out: Change = [];
  if (removeCount > 0) out.push({ t: 'del', pos: index, count: removeCount });
  if (insert.length > 0) out.push({ t: 'ins', pos: index, items: clone(insert) });
  return out;
}

/** Adapt a history Patch into a collab change. */
export function changeFromPatch(patch: Patch): Change {
  return replaceChange(patch.index, patch.remove.length, patch.insert);
}

/** Apply a change to a document, returning a new document. */
export function applyChange(doc: DocData, change: Change): DocData {
  const content = doc.content.slice();
  for (const op of change) {
    if (op.t === 'del') content.splice(op.pos, op.count);
    else content.splice(op.pos, 0, ...clone(op.items));
  }
  return { type: 'doc', content };
}

// ---- primitive transform ----

// Rebase primitive `a` to apply after primitive `b` (both in the same base
// coordinates). Returns a change of 0..2 prims (a delete straddling a
// concurrent insert splits into two), in coordinates after `b`.
function xPrimPrim(a: Prim, b: Prim, side: Side): Change {
  if (a.t === 'ins' && b.t === 'ins') {
    const after = a.pos > b.pos || (a.pos === b.pos && side === 'right');
    return [{ t: 'ins', pos: after ? a.pos + b.items.length : a.pos, items: clone(a.items) }];
  }

  if (a.t === 'ins' && b.t === 'del') {
    if (a.pos <= b.pos) return [{ t: 'ins', pos: a.pos, items: clone(a.items) }];
    if (a.pos >= b.pos + b.count) return [{ t: 'ins', pos: a.pos - b.count, items: clone(a.items) }];
    return [{ t: 'ins', pos: b.pos, items: clone(a.items) }];
  }

  if (a.t === 'del' && b.t === 'ins') {
    const aE = a.pos + a.count;
    if (b.pos >= aE) return [{ t: 'del', pos: a.pos, count: a.count }];
    if (b.pos <= a.pos) return [{ t: 'del', pos: a.pos + b.items.length, count: a.count }];
    // b inserted inside a's delete range: split so b's inserted blocks survive.
    const left = b.pos - a.pos;
    return [
      { t: 'del', pos: a.pos, count: left },
      { t: 'del', pos: a.pos + b.items.length, count: a.count - left },
    ];
  }

  // del vs del
  if (a.t === 'del' && b.t === 'del') {
    const aS = a.pos, aE = a.pos + a.count;
    const bS = b.pos, bE = b.pos + b.count;
    if (aE <= bS) return [{ t: 'del', pos: aS, count: a.count }];
    if (aS >= bE) return [{ t: 'del', pos: aS - b.count, count: a.count }];
    const leftCount = Math.max(0, Math.min(aE, bS) - aS);
    const rightCount = Math.max(0, aE - Math.max(aS, bE));
    const count = leftCount + rightCount;
    return count === 0 ? [] : [{ t: 'del', pos: Math.min(aS, bS), count }];
  }
  return [a]; // unreachable: all prim-type pairs handled above
}

// ---- change transform (standard mutual recursion) ----

// Rebase prim `a` past change `B`, and `B` past `a`. Both start in the same base
// coordinates; returns [a rebased after B, B rebased after a].
function primVsChange(a: Prim, B: Change, side: Side): [Change, Change] {
  if (B.length === 0) return [[a], []];
  const [b0, ...bRest] = B;
  const aPast0 = xPrimPrim(a, b0, side);
  const b0Past = xPrimPrim(b0, a, opposite(side));
  const [aPast, bRestPast] = changeVsChange(aPast0, bRest, side);
  return [aPast, [...b0Past, ...bRestPast]];
}

// Rebase change `A` past change `B`, and `B` past `A`. Both from the same base;
// returns [A rebased after B, B rebased after A].
function changeVsChange(A: Change, B: Change, side: Side): [Change, Change] {
  if (A.length === 0) return [[], B.slice()];
  const [a0, ...aRest] = A;
  const [a0Past, Bp] = primVsChange(a0, B, side);
  const [aRestPast, Bpp] = changeVsChange(aRest, Bp, side);
  return [[...a0Past, ...aRestPast], Bpp];
}

/** Rebase change `a` to apply after concurrent change `b` (a's side tie-break). */
export function transform(a: Change, b: Change, side: Side): Change {
  return changeVsChange(a, b, side)[0];
}

/** Rebase both directions at once: [a after b, b after a]. */
export function transformBoth(a: Change, b: Change, side: Side): [Change, Change] {
  return changeVsChange(a, b, side);
}

// A transport-agnostic collaboration client. Holds the local unconfirmed
// changes and rebases them as remote changes arrive; the app supplies any
// channel and feeds confirmed remote changes in a consistent global order.
export class Collab {
  private unconfirmed: Change[] = [];

  // `id` is this peer's site identifier: it provides the *global* tie-break so
  // two peers pick complementary transform sides and converge. Any total order
  // works (client index, uuid compare); lower id wins ties.
  constructor(public id = 0, public version = 0) {}

  /** Record a locally-applied change as unconfirmed (awaiting server ack). */
  local(change: Change): void {
    this.unconfirmed.push(clone(change));
  }

  /** Number of local changes not yet acknowledged. */
  get pending(): number {
    return this.unconfirmed.length;
  }

  // Integrate a remote change concurrent with our unconfirmed changes. `remoteId`
  // is the originating peer's site id; the remote change transforms on the
  // 'left' when it globally precedes us (remoteId < our id), 'right' otherwise —
  // so both peers agree on ordering and converge. Rebases the remote past each
  // local unconfirmed change (to apply now) and each local change past the
  // remote (to keep them valid). Returns the change to apply to the local doc.
  receive(remote: Change, remoteId = -1): Change {
    const side: Side = remoteId < this.id ? 'left' : 'right';
    let r = clone(remote);
    const rebased: Change[] = [];
    for (const localChange of this.unconfirmed) {
      const [rPast, localPast] = transformBoth(r, localChange, side);
      r = rPast;
      rebased.push(localPast);
    }
    this.unconfirmed = rebased;
    this.version++;
    return r;
  }

  /** Confirm our oldest unconfirmed change (server acknowledged it). */
  ack(): void {
    this.unconfirmed.shift();
    this.version++;
  }
}
