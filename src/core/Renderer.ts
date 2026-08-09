// Render a Model document into an editable element.
// Each top-level block becomes exactly one child element (no stray text
// nodes between blocks), so block indices stay in sync with Position mapping.
//
// Rendering is incremental: the target HTML is built once into a detached
// element, then reconciled into the live DOM via `morph`, so untouched blocks
// keep their DOM nodes (caret / IME survive) and cost scales with the change.

import type { DocData } from './Model.js';
import { serialize } from '../conversion/Serializer.js';
import { morph } from './morph.js';

const LEAF_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,figure';

// Empty leaf blocks need a <br> so the browser can place a caret inside them.
function addCaretFillers(root: HTMLElement): void {
  for (const block of Array.from(root.querySelectorAll(LEAF_BLOCK_SELECTOR))) {
    if (!block.textContent && block.children.length === 0) {
      block.appendChild(root.ownerDocument!.createElement('br'));
    }
  }
}

export function render(editable: HTMLElement, doc: DocData): void {
  // Build the desired tree off-DOM. Serialize the whole document so list
  // items group into <ul>/<ol>.
  const target = editable.ownerDocument!.createElement('div');
  target.innerHTML = serialize(doc) || '<p><br></p>';
  addCaretFillers(target);

  morph(editable, target);
}
