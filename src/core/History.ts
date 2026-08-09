import { DocData } from './Model.js';
import type { ModelSel } from './Position.js';
import { Patch, diffDoc, applyPatch, invertPatch } from './patch.js';

// A history step stores the reversible patch for one change (not a full
// document snapshot), together with the selection before and after. Undo
// applies the inverse patch to the live document; redo applies the patch.
// Because only the changed blocks are kept, memory scales with edit size, not
// document size — and the undo stack is capped so a long session can't grow
// without bound.
interface Step {
  patch: Patch;
  inverse: Patch;
  selBefore: ModelSel;
  selAfter: ModelSel;
}

// Kept for backward compatibility with callers that consumed the old snapshot
// entry shape ({ doc, sel }); undo/redo return this.
export interface HistoryEntry {
  doc: DocData;
  sel: ModelSel;
}

function cloneSel(sel: ModelSel): ModelSel {
  return JSON.parse(JSON.stringify(sel));
}

export class History {
  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private coalescing = false;

  // `limit` caps the undo depth; the oldest step is dropped past it.
  constructor(private limit = 1000) {}

  // Record a change from `before` to `after`, with the selection on each side.
  // When `coalesce` is true and the previous push also coalesced, the two merge
  // into a single step (a typing burst becomes one undo), by re-diffing from the
  // run's original `before` to the new `after` — reconstructed from the live
  // `before` and the step's inverse, so no extra document snapshot is retained.
  push(before: DocData, after: DocData, selBefore: ModelSel, selAfter: ModelSel, coalesce = false): void {
    if (coalesce && this.coalescing && this.undoStack.length > 0) {
      const top = this.undoStack[this.undoStack.length - 1];
      const firstBefore = applyPatch(before, top.inverse);
      top.patch = diffDoc(firstBefore, after);
      top.inverse = invertPatch(top.patch);
      top.selAfter = cloneSel(selAfter);
      this.redoStack = [];
      return;
    }

    const patch = diffDoc(before, after);
    this.undoStack.push({
      patch,
      inverse: invertPatch(patch),
      selBefore: cloneSel(selBefore),
      selAfter: cloneSel(selAfter),
    });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.coalescing = coalesce;
  }

  // End the current coalescing run (selection change, blur, non-typing command)
  // so the next typing push starts a fresh undo step.
  breakCoalescing(): void {
    this.coalescing = false;
  }

  // Undo the most recent step: return the document with the inverse patch
  // applied and the selection that was current before the change.
  undo(current: DocData): HistoryEntry | null {
    const step = this.undoStack.pop();
    if (!step) return null;
    this.redoStack.push(step);
    this.coalescing = false;
    return { doc: applyPatch(current, step.inverse), sel: cloneSel(step.selBefore) };
  }

  // Redo the most recently undone step: re-apply its patch and hand back the
  // selection captured after the original change.
  redo(current: DocData): HistoryEntry | null {
    const step = this.redoStack.pop();
    if (!step) return null;
    this.undoStack.push(step);
    this.coalescing = false;
    return { doc: applyPatch(current, step.patch), sel: cloneSel(step.selAfter) };
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  /** Current undo depth (for tests / diagnostics). */
  get depth(): number { return this.undoStack.length; }
}
