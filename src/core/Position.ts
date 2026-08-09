// Model-space positions and DOM <-> Model mapping.
// A position is a block index + character offset within that block
// (offset counts characters across all inline text nodes of the block).

// A plain position addresses a top-level block. A position `cell` points
// inside a table: `block` is the table's own top-level index, and `para`
// is the local paragraph index within that cell's content list.
export interface ModelPos {
  block: number;
  offset: number;
  cell?: { row: number; col: number; para: number };
}

export interface ModelSel {
  anchor: ModelPos;
  head: ModelPos;
}

function cellEq(a?: ModelPos['cell'], b?: ModelPos['cell']): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.row === b.row && a.col === b.col && a.para === b.para;
}

export function posEq(a: ModelPos, b: ModelPos): boolean {
  return a.block === b.block && a.offset === b.offset && cellEq(a.cell, b.cell);
}

export function selCollapsed(sel: ModelSel): boolean {
  return posEq(sel.anchor, sel.head);
}

// Order anchor/head so start <= end (document order). Ranges spanning two
// different table cells aren't ordered here — callers that support
// multi-cell selection (mergeCells) read anchor/head cell coords directly.
export function normalizedRange(sel: ModelSel): { start: ModelPos; end: ModelPos } {
  const { anchor, head } = sel;
  const aUnit = anchor.cell ? anchor.cell.para : anchor.block;
  const hUnit = head.cell ? head.cell.para : head.block;
  if (aUnit < hUnit || (aUnit === hUnit && anchor.offset <= head.offset)) {
    return { start: anchor, end: head };
  }
  return { start: head, end: anchor };
}

export const collapsed = (block: number, offset: number): ModelSel => ({
  anchor: { block, offset },
  head: { block, offset },
});

// ---- DOM <-> Model mapping ----
// Convention: each direct child of `editable` is one top-level block, in order.
// A <table> counts as exactly one top-level block (matching one `table`
// entry in doc.content) — the leaf blocks inside its cells are addressed
// separately via ModelPos.cell, not folded into the top-level count.

const LEAF_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,figure';
const TOP_LEVEL_SELECTOR = `${LEAF_BLOCK_SELECTOR},table`;

function isLeafBlock(el: Element): boolean {
  return el.matches(LEAF_BLOCK_SELECTOR);
}

function closestCell(editable: HTMLElement, node: Node): HTMLElement | null {
  let el: Node | null = node;
  while (el && el !== editable) {
    if (el.nodeType === Node.ELEMENT_NODE && (el as Element).matches('td,th')) return el as HTMLElement;
    el = el.parentNode;
  }
  return null;
}

// Ordered list of the document's top-level block elements: leaf blocks
// (paragraphs, headings, list items, …) that live outside any table cell,
// plus each <table> as a single unit.
function blockElements(editable: HTMLElement): Element[] {
  return Array.from(editable.querySelectorAll(TOP_LEVEL_SELECTOR))
    .filter(el => el.tagName === 'TABLE' || !el.closest('td,th'));
}

// Public: map a top-level DOM element (a leaf block or a <table>) back to
// its doc.content index. Used by plugins that need to address a specific
// table from a raw DOM element (e.g. TablePlugin's column-resize commit).
export function topLevelBlockIndexOf(editable: HTMLElement, el: Element): number {
  return blockElements(editable).indexOf(el);
}

function blockIndexOf(editable: HTMLElement, node: Node): number {
  let el: Node | null = node;
  while (el && el !== editable) {
    if (el.nodeType === Node.ELEMENT_NODE && isLeafBlock(el as Element)) {
      return blockElements(editable).indexOf(el as Element);
    }
    el = el.parentNode;
  }
  return -1;
}

// Leaf blocks local to a single table cell, in document order.
function cellLeafBlocks(cellEl: HTMLElement): Element[] {
  return Array.from(cellEl.querySelectorAll(LEAF_BLOCK_SELECTOR));
}

function cellLocalIndexOf(cellEl: HTMLElement, node: Node): number {
  let el: Node | null = node;
  while (el && el !== cellEl) {
    if (el.nodeType === Node.ELEMENT_NODE && isLeafBlock(el as Element)) {
      return cellLeafBlocks(cellEl).indexOf(el as Element);
    }
    el = el.parentNode;
  }
  return -1;
}

function cellCoords(cellEl: HTMLElement): { row: number; col: number } {
  const trEl = cellEl.closest('tr')!;
  const tableEl = cellEl.closest('table')!;
  const row = Array.from(tableEl.querySelectorAll('tr')).indexOf(trEl);
  const col = Array.from(trEl.children).indexOf(cellEl);
  return { row, col };
}

// Count text characters from the start of `root` up to (node, offset).
function charOffsetWithin(root: Node, node: Node, offset: number): number {
  const range = root.ownerDocument!.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

// Walk a block element's text nodes to find the (node, offset) at a char offset.
function walkToOffset(blockEl: Node, offset: number): { node: Node; offset: number } {
  const walker = blockEl.ownerDocument!.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let last: Text | null = null;
  let current: Node | null = walker.nextNode();
  while (current) {
    const t = current as Text;
    const len = t.textContent!.length;
    if (offset <= acc + len) {
      return { node: t, offset: offset - acc };
    }
    acc += len;
    last = t;
    current = walker.nextNode();
  }
  if (last) return { node: last, offset: last.textContent!.length };
  return { node: blockEl, offset: 0 };
}

export function domToModel(editable: HTMLElement, node: Node, offset: number): ModelPos {
  const cellEl = closestCell(editable, node);
  if (cellEl) {
    const tableEl = cellEl.closest('table')!;
    const tableIndex = blockElements(editable).indexOf(tableEl);
    const { row, col } = cellCoords(cellEl);
    const para = Math.max(0, cellLocalIndexOf(cellEl, node));
    const paraEl = cellLeafBlocks(cellEl)[para] ?? cellEl;
    const charOffset = charOffsetWithin(paraEl, node, offset);
    return { block: Math.max(0, tableIndex), offset: charOffset, cell: { row, col, para } };
  }

  const block = blockIndexOf(editable, node);
  if (block < 0) return { block: 0, offset: 0 };
  const blockEl = blockElements(editable)[block];
  const charOffset = charOffsetWithin(blockEl, node, offset);
  return { block, offset: charOffset };
}

export function modelToDom(editable: HTMLElement, pos: ModelPos): { node: Node; offset: number } {
  if (pos.cell) {
    const blocks = blockElements(editable);
    const tableEl = blocks[Math.min(pos.block, blocks.length - 1)] as HTMLElement;
    if (!tableEl) return { node: editable, offset: 0 };
    const trEl = tableEl.querySelectorAll('tr')[pos.cell.row];
    const cellEl = trEl?.children[pos.cell.col] as HTMLElement | undefined;
    if (!cellEl) return { node: editable, offset: 0 };
    const localBlocks = cellLeafBlocks(cellEl);
    const paraEl = (localBlocks[Math.min(pos.cell.para, localBlocks.length - 1)] as Node) ?? cellEl;
    return walkToOffset(paraEl, pos.offset);
  }

  const blocks = blockElements(editable);
  const blockEl = blocks[Math.min(pos.block, blocks.length - 1)] as Node;
  if (!blockEl) return { node: editable, offset: 0 };
  return walkToOffset(blockEl, pos.offset);
}

// Public: the leaf block element (paragraph, heading, list item, ...) that
// contains a given model position. Used for block-scoped resync so an IME or
// unhandled native edit reparses only its own block, not the whole document.
export function leafBlockElementAt(editable: HTMLElement, pos: ModelPos): HTMLElement | null {
  const { node } = modelToDom(editable, pos);
  let el: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  while (el && el !== editable) {
    if (el.nodeType === Node.ELEMENT_NODE && (el as Element).matches(LEAF_BLOCK_SELECTOR)) {
      return el as HTMLElement;
    }
    el = el.parentNode;
  }
  return null;
}

// Read the current browser selection as a Model selection (or null if outside editable).
export function readSelection(editable: HTMLElement): ModelSel | null {
  const sel = editable.ownerDocument!.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = sel;
  if (!anchorNode || !focusNode) return null;
  if (!editable.contains(anchorNode) || !editable.contains(focusNode)) return null;
  return {
    anchor: domToModel(editable, anchorNode, anchorOffset),
    head: domToModel(editable, focusNode, focusOffset),
  };
}

// Write a Model selection back into the browser.
export function writeSelection(editable: HTMLElement, modelSel: ModelSel): void {
  const doc = editable.ownerDocument!;
  const sel = doc.getSelection();
  if (!sel) return;
  const a = modelToDom(editable, modelSel.anchor);
  const h = modelToDom(editable, modelSel.head);
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  const collapsedSel = modelSel.anchor.block === modelSel.head.block && modelSel.anchor.offset === modelSel.head.offset;
  if (collapsedSel) {
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } else {
    sel.removeAllRanges();
    sel.addRange(range);
    sel.extend(h.node, h.offset);
  }
}
