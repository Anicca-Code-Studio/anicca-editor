// Reversible document patches.
//
// A change to the document is captured as the minimal replaced block-range:
// the common prefix and suffix of the block arrays are left untouched, and the
// differing middle span of `before` is swapped for the differing middle span of
// `after`. For a typical edit (one block changed) the patch holds just that one
// block's old and new value, not the whole document — so history entries stay
// small and are trivially invertible. The patch is plain JSON, so it also
// serves as a serializable operation for persistence or transport.

import type { DocData, BlockNodeData } from './Model.js';

export interface Patch {
  /** Index of the first block that differs. */
  index: number;
  /** The blocks removed at `index` (the old middle span). */
  remove: BlockNodeData[];
  /** The blocks inserted at `index` (the new middle span). */
  insert: BlockNodeData[];
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function blockEq(a: BlockNodeData, b: BlockNodeData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Compute the reversible patch that turns `before` into `after`.
export function diffDoc(before: DocData, after: DocData): Patch {
  const A = before.content;
  const B = after.content;
  const min = Math.min(A.length, B.length);

  let pre = 0;
  while (pre < min && blockEq(A[pre], B[pre])) pre++;

  let suf = 0;
  while (suf < min - pre && blockEq(A[A.length - 1 - suf], B[B.length - 1 - suf])) suf++;

  return {
    index: pre,
    remove: clone(A.slice(pre, A.length - suf)),
    insert: clone(B.slice(pre, B.length - suf)),
  };
}

// Apply a patch to a document, returning a new document. The prefix/suffix
// blocks are shared structurally-untouched; only the middle span is spliced.
export function applyPatch(doc: DocData, patch: Patch): DocData {
  const content = doc.content.slice();
  content.splice(patch.index, patch.remove.length, ...clone(patch.insert));
  return { type: 'doc', content };
}

// The inverse patch: applying it undoes `patch`.
export function invertPatch(patch: Patch): Patch {
  return { index: patch.index, remove: clone(patch.insert), insert: clone(patch.remove) };
}

// Whether a patch changes nothing (empty remove and insert).
export function isEmptyPatch(patch: Patch): boolean {
  return patch.remove.length === 0 && patch.insert.length === 0;
}
