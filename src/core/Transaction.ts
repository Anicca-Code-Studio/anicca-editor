// Pure Model transformations. No DOM. Each op takes (doc, sel, ...args)
// and returns a fresh { doc, sel } — never mutating the input.

import type { DocData, BlockNodeData, TextNodeData, MarkData } from './Model.js';
import { cloneDoc } from './Model.js';
import type { ModelPos, ModelSel } from './Position.js';
import { collapsed, selCollapsed, normalizedRange } from './Position.js';

export interface TxResult {
  doc: DocData;
  sel: ModelSel;
}

// ---- inline (text-node) helpers ----

function marksEqual(a?: MarkData[], b?: MarkData[]): boolean {
  const an = a ?? [];
  const bn = b ?? [];
  if (an.length !== bn.length) return false;
  const key = (m: MarkData) => `${m.type}:${JSON.stringify(m.attrs ?? {})}`;
  const as = an.map(key).sort();
  const bs = bn.map(key).sort();
  return as.every((k, i) => k === bs[i]);
}

function onlyTextNodes(content: BlockNodeData['content']): TextNodeData[] {
  return (content ?? []).filter((n): n is TextNodeData => n.type === 'text');
}

// Merge adjacent text nodes with identical marks; drop empty text nodes.
function normalizeInlines(nodes: TextNodeData[]): TextNodeData[] {
  const out: TextNodeData[] = [];
  for (const n of nodes) {
    if (n.text === '') continue;
    const prev = out[out.length - 1];
    if (prev && marksEqual(prev.marks, n.marks)) {
      prev.text += n.text;
    } else {
      out.push({ type: 'text', text: n.text, ...(n.marks ? { marks: n.marks } : {}) });
    }
  }
  return out;
}

// Locate which text node an offset falls into.
// Returns the node index and the local offset within that node.
// Boundary between two nodes lands at the END of the left node.
function locateText(nodes: TextNodeData[], offset: number): { index: number; local: number } {
  let acc = 0;
  for (let i = 0; i < nodes.length; i++) {
    const len = nodes[i].text.length;
    if (offset <= acc + len) {
      return { index: i, local: offset - acc };
    }
    acc += len;
  }
  // past the end: clamp to end of last node
  const last = nodes.length - 1;
  return { index: last, local: last >= 0 ? nodes[last].text.length : 0 };
}

function blockCharLen(nodes: TextNodeData[]): number {
  return nodes.reduce((n, t) => n + t.text.length, 0);
}

// Split a block's inline nodes at a character offset into left/right halves.
function splitInlines(nodes: TextNodeData[], offset: number): { left: TextNodeData[]; right: TextNodeData[] } {
  const left: TextNodeData[] = [];
  const right: TextNodeData[] = [];
  let acc = 0;
  for (const n of nodes) {
    const len = n.text.length;
    if (offset <= acc) {
      right.push(n);
    } else if (offset >= acc + len) {
      left.push(n);
    } else {
      const cut = offset - acc;
      left.push({ type: 'text', text: n.text.slice(0, cut), ...(n.marks ? { marks: n.marks } : {}) });
      right.push({ type: 'text', text: n.text.slice(cut), ...(n.marks ? { marks: n.marks } : {}) });
    }
    acc += len;
  }
  return { left: normalizeInlines(left), right: normalizeInlines(right) };
}

// ---- block location helpers (top-level flat list, or inside a table cell) ----

interface Located {
  list: BlockNodeData[]; // the flat leaf-block list `pos` indexes into
  index: number;         // local index of the target leaf block within `list`
}

// Resolve which flat block list a position addresses: the document's
// top-level content, or (when `pos.cell` is set) the content list of a
// single table cell. `pos.block` always names the table's own top-level
// index in the latter case; `pos.cell.para` is the index within the cell.
function locateBlock(doc: DocData, pos: ModelPos): Located {
  if (!pos.cell) return { list: doc.content, index: pos.block };
  const table = doc.content[pos.block];
  const row = (table.content as BlockNodeData[])[pos.cell.row];
  const cell = (row.content as BlockNodeData[])[pos.cell.col];
  return { list: cell.content as BlockNodeData[], index: pos.cell.para };
}

// Rebuild a position that points at `index`/`offset` within the same
// list (top-level or cell) that `pos` already pointed into.
function posAt(pos: ModelPos, index: number, offset: number): ModelPos {
  return pos.cell ? { block: pos.block, offset, cell: { ...pos.cell, para: index } } : { block: index, offset };
}

function collapsedAt(pos: ModelPos, index: number, offset: number): ModelSel {
  const p = posAt(pos, index, offset);
  return { anchor: p, head: p };
}

// Text-level ops (delete/mark/etc.) only support ranges within a single flat
// list: the top-level document, or one table cell. A native browser
// selection can drag across a cell boundary (or from a cell out to top-level
// content) — that's not a supported text range, so callers treat it as a no-op
// rather than risk corrupting two unrelated block lists.
function crossesContainerBoundary(a: ModelPos, b: ModelPos): boolean {
  if (!a.cell && !b.cell) return false;
  if (!a.cell || !b.cell) return true;
  return a.block !== b.block || a.cell.row !== b.cell.row || a.cell.col !== b.cell.col;
}

// ---- operations ----

export function insertText(doc: DocData, sel: ModelSel, text: string): TxResult {
  if (text === '') return { doc, sel };

  const next = cloneDoc(doc);
  const pos = sel.head;
  const { list, index } = locateBlock(next, pos);
  const offset = pos.offset;
  const nodes = onlyTextNodes(list[index].content);

  if (nodes.length === 0) {
    list[index].content = [{ type: 'text', text }];
    return { doc: next, sel: collapsedAt(pos, index, text.length) };
  }

  const { index: ti, local } = locateText(nodes, offset);
  const target = nodes[ti];
  target.text = target.text.slice(0, local) + text + target.text.slice(local);

  list[index].content = normalizeInlines(nodes);
  return { doc: next, sel: collapsedAt(pos, index, offset + text.length) };
}

export function deleteRange(doc: DocData, sel: ModelSel): TxResult {
  if (selCollapsed(sel)) return { doc, sel };

  if (crossesContainerBoundary(sel.anchor, sel.head)) return { doc, sel };

  const { start, end } = normalizedRange(sel);
  const next = cloneDoc(doc);
  const { list, index: si } = locateBlock(next, start);
  const { index: ei } = locateBlock(next, end);

  if (si === ei) {
    const nodes = onlyTextNodes(list[si].content);
    const { left } = splitInlines(nodes, start.offset);
    const { right } = splitInlines(nodes, end.offset);
    list[si].content = normalizeInlines([...left, ...right]);
    return { doc: next, sel: collapsedAt(start, si, start.offset) };
  }

  const startLeft = splitInlines(onlyTextNodes(list[si].content), start.offset).left;
  const endRight = splitInlines(onlyTextNodes(list[ei].content), end.offset).right;
  list[si].content = normalizeInlines([...startLeft, ...endRight]);
  list.splice(si + 1, ei - si);
  return { doc: next, sel: collapsedAt(start, si, start.offset) };
}

export function deleteBackward(doc: DocData, sel: ModelSel): TxResult {
  if (!selCollapsed(sel)) return deleteRange(doc, sel);
  const pos = sel.head;
  const { list, index } = locateBlock(doc, pos);
  if (pos.offset > 0) {
    return deleteRange(doc, { anchor: posAt(pos, index, pos.offset - 1), head: pos });
  }
  if (index > 0) {
    if (pos.cell) return mergeBlockInList(doc, pos, index);
    return mergeBlock(doc, index);
  }
  return { doc, sel };
}

export function deleteForward(doc: DocData, sel: ModelSel): TxResult {
  if (!selCollapsed(sel)) return deleteRange(doc, sel);
  const pos = sel.head;
  const { list, index } = locateBlock(doc, pos);
  const len = blockCharLen(onlyTextNodes(list[index].content));
  if (pos.offset < len) {
    return deleteRange(doc, { anchor: pos, head: posAt(pos, index, pos.offset + 1) });
  }
  if (index < list.length - 1) {
    if (pos.cell) return mergeBlockInList(doc, pos, index + 1);
    return mergeBlock(doc, index + 1);
  }
  return { doc, sel };
}

export function splitBlock(doc: DocData, sel: ModelSel): TxResult {
  let base: TxResult = { doc, sel };
  if (!selCollapsed(sel)) base = deleteRange(doc, sel);

  const next = cloneDoc(base.doc);
  const pos = base.sel.head;
  const { list, index } = locateBlock(next, pos);
  const src = list[index];
  const { left, right } = splitInlines(onlyTextNodes(src.content), pos.offset);

  src.content = left;
  const newBlock: BlockNodeData = {
    type: src.type,
    ...(src.attrs ? { attrs: JSON.parse(JSON.stringify(src.attrs)) } : {}),
    content: right,
  };
  list.splice(index + 1, 0, newBlock);
  return { doc: next, sel: collapsedAt(pos, index + 1, 0) };
}

function hasMark(node: TextNodeData, markType: string): boolean {
  return !!node.marks?.some(m => m.type === markType);
}

// Isolate the text nodes covered by [from, to) within a block's inlines.
function sliceRange(nodes: TextNodeData[], from: number, to: number): { left: TextNodeData[]; mid: TextNodeData[]; right: TextNodeData[] } {
  const a = splitInlines(nodes, from);
  const b = splitInlines(a.right, to - from);
  return { left: a.left, mid: b.left, right: b.right };
}

// Collect the per-block covered node lists for a selection (top-level, or
// inside a single table cell — same list, since cross-cell text ranges
// aren't supported by these text-level ops).
function coveredBlocks(doc: DocData, sel: ModelSel): Array<{ list: BlockNodeData[]; index: number; from: number; to: number }> {
  if (crossesContainerBoundary(sel.anchor, sel.head)) return [];
  const { start, end } = normalizedRange(sel);
  const { list, index: si } = locateBlock(doc, start);
  const { index: ei } = locateBlock(doc, end);
  const out: Array<{ list: BlockNodeData[]; index: number; from: number; to: number }> = [];
  for (let i = si; i <= ei; i++) {
    const len = blockCharLen(onlyTextNodes(list[i].content));
    const from = i === si ? start.offset : 0;
    const to = i === ei ? end.offset : len;
    out.push({ list, index: i, from, to });
  }
  return out;
}

export function rangeHasMark(doc: DocData, sel: ModelSel, markType: string): boolean {
  if (selCollapsed(sel)) return false;
  if (crossesContainerBoundary(sel.anchor, sel.head)) return false;
  for (const { list, index, from, to } of coveredBlocks(doc, sel)) {
    if (from === to) continue;
    const { mid } = sliceRange(onlyTextNodes(list[index].content), from, to);
    if (mid.length === 0 || !mid.every(n => hasMark(n, markType))) return false;
  }
  return true;
}

export function toggleMark(doc: DocData, sel: ModelSel, markType: string, attrs?: Record<string, any>): TxResult {
  if (selCollapsed(sel)) return { doc, sel };

  const add = !rangeHasMark(doc, sel, markType);
  const next = cloneDoc(doc);

  for (const { list, index, from, to } of coveredBlocks(next, sel)) {
    if (from === to) continue;
    const nodes = onlyTextNodes(list[index].content);
    const { left, mid, right } = sliceRange(nodes, from, to);
    for (const n of mid) {
      const others = (n.marks ?? []).filter(m => m.type !== markType);
      if (add) {
        others.push({ type: markType, ...(attrs ? { attrs } : {}) });
      }
      if (others.length) n.marks = others; else delete n.marks;
    }
    list[index].content = normalizeInlines([...left, ...mid, ...right]);
  }

  return { doc: next, sel };
}

// Add / replace / remove a mark across a selection without the toggle
// semantics: `add` true always sets the mark (replacing any existing mark of
// the same type, so a colour swap doesn't stack), `add` false always removes
// it. Used by attribute marks (colour, background, font size) where "apply"
// means set, not toggle.
function applyMarkRange(doc: DocData, sel: ModelSel, markType: string, attrs: Record<string, any> | undefined, add: boolean): TxResult {
  if (selCollapsed(sel)) return { doc, sel };
  if (crossesContainerBoundary(sel.anchor, sel.head)) return { doc, sel };
  const next = cloneDoc(doc);
  for (const { list, index, from, to } of coveredBlocks(next, sel)) {
    if (from === to) continue;
    const nodes = onlyTextNodes(list[index].content);
    const { left, mid, right } = sliceRange(nodes, from, to);
    for (const n of mid) {
      const others = (n.marks ?? []).filter(m => m.type !== markType);
      if (add) others.push({ type: markType, ...(attrs ? { attrs } : {}) });
      if (others.length) n.marks = others; else delete n.marks;
    }
    list[index].content = normalizeInlines([...left, ...mid, ...right]);
  }
  return { doc: next, sel };
}

export function setMark(doc: DocData, sel: ModelSel, markType: string, attrs?: Record<string, any>): TxResult {
  return applyMarkRange(doc, sel, markType, attrs, true);
}

export function removeMark(doc: DocData, sel: ModelSel, markType: string): TxResult {
  return applyMarkRange(doc, sel, markType, undefined, false);
}

// Set (or clear) a single attribute on every top-level block the selection
// covers, merging into existing attrs. A null/undefined/'' value or the
// per-key default ('left' for align) removes the key so the block stays
// byte-identical to a never-styled one.
export function setBlockAttr(doc: DocData, sel: ModelSel, key: string, value: any): TxResult {
  if (crossesContainerBoundary(sel.anchor, sel.head)) return { doc, sel };
  const { start, end } = normalizedRange(sel);
  const next = cloneDoc(doc);
  const { list, index: si } = locateBlock(next, start);
  const { index: ei } = locateBlock(next, end);
  const isDefault = value == null || value === '' || (key === 'align' && value === 'left');
  for (let i = si; i <= ei; i++) {
    const block = list[i];
    const attrs = { ...(block.attrs ?? {}) };
    if (isDefault) delete attrs[key]; else attrs[key] = value;
    if (Object.keys(attrs).length) block.attrs = attrs; else delete block.attrs;
  }
  return { doc: next, sel };
}

// Replace a single block's inline content in place, keeping its type and
// attrs. Used by block-scoped resync (IME / unhandled native edits): the DOM
// block already holds the new text, so we reparse just that block's inlines
// back into the model. A code_block holds plain text only, so marks flatten.
export function replaceBlockInlines(doc: DocData, pos: ModelPos, inlines: TextNodeData[]): DocData {
  const next = cloneDoc(doc);
  const { list, index } = locateBlock(next, pos);
  const block = list[index];
  if (block.type === 'code_block') {
    const text = inlines.map(n => n.text).join('');
    block.content = text ? [{ type: 'text', text }] : [];
  } else {
    block.content = normalizeInlines(inlines);
  }
  return next;
}

// Insert an atomic image block after the block the caret sits in, and make
// sure there is a paragraph after it to hold the caret (images are not
// editable, so the selection must land somewhere typeable).
export function insertImage(doc: DocData, sel: ModelSel, attrs: Record<string, any>): TxResult {
  const next = cloneDoc(doc);
  const insertIdx = sel.head.block + 1;
  next.content.splice(insertIdx, 0, { type: 'image', attrs: { ...attrs } });
  const caretIdx = insertIdx + 1;
  if (caretIdx >= next.content.length || next.content[caretIdx].type === 'image') {
    next.content.splice(caretIdx, 0, { type: 'paragraph', content: [] });
  }
  return { doc: next, sel: collapsed(caretIdx, 0) };
}

// Patch an image block's attrs (width / align / caption / alt). Empty values
// (null width, '' align, '' caption) drop the key so a reset image stays
// byte-identical to a never-styled one. No-op if the block isn't an image.
export function updateImage(doc: DocData, blockIndex: number, patch: Record<string, any>): TxResult {
  const b = doc.content[blockIndex];
  if (!b || b.type !== 'image') return { doc, sel: collapsed(Math.max(0, blockIndex), 0) };
  const next = cloneDoc(doc);
  const attrs = { ...(next.content[blockIndex].attrs ?? {}), ...patch };
  if (attrs.width == null) delete attrs.width;
  if (!attrs.align) delete attrs.align;
  if (!attrs.caption) delete attrs.caption;
  next.content[blockIndex].attrs = attrs;
  return { doc: next, sel: collapsed(blockIndex, 0) };
}

// Insert an atomic media-embed block after the caret's block, ensuring a
// paragraph follows so the selection lands somewhere typeable (embeds, like
// images, are not editable). Mirrors insertImage.
export function insertEmbed(doc: DocData, sel: ModelSel, attrs: Record<string, any>): TxResult {
  const next = cloneDoc(doc);
  const insertIdx = sel.head.block + 1;
  next.content.splice(insertIdx, 0, { type: 'embed', attrs: { ...attrs } });
  const caretIdx = insertIdx + 1;
  if (caretIdx >= next.content.length || next.content[caretIdx].type === 'embed') {
    next.content.splice(caretIdx, 0, { type: 'paragraph', content: [] });
  }
  return { doc: next, sel: collapsed(caretIdx, 0) };
}

// ---- fragment (clipboard) operations ----

function cloneBlock(block: BlockNodeData): BlockNodeData {
  return JSON.parse(JSON.stringify(block));
}

// Extract the selected content as a standalone document fragment. Each covered
// block contributes a copy carrying only its selected inline slice, so a copy
// preserves block types (heading, list_item, ...) and inline marks.
export function sliceSelection(doc: DocData, sel: ModelSel): DocData {
  if (selCollapsed(sel)) return { type: 'doc', content: [] };
  if (crossesContainerBoundary(sel.anchor, sel.head)) return { type: 'doc', content: [] };

  const out: BlockNodeData[] = [];
  for (const { list, index, from, to } of coveredBlocks(doc, sel)) {
    const src = list[index];
    const { mid } = sliceRange(onlyTextNodes(src.content), from, to);
    out.push({
      type: src.type,
      ...(src.attrs ? { attrs: JSON.parse(JSON.stringify(src.attrs)) } : {}),
      content: mid,
    });
  }
  return { type: 'doc', content: out };
}

// Insert a document fragment at the selection, replacing any selected range
// first. A single-block fragment merges inline at the caret; a multi-block
// fragment splits the current block, appending the fragment's first block to
// the left half and prepending its last block to the right half, with any
// middle blocks spliced whole in between (so a pasted table survives).
export function insertFragment(doc: DocData, sel: ModelSel, fragment: DocData): TxResult {
  const blocks = fragment.content;
  if (blocks.length === 0) return { doc, sel };

  const base: TxResult = selCollapsed(sel) ? { doc, sel } : deleteRange(doc, sel);
  const next = cloneDoc(base.doc);
  const pos = base.sel.head;
  const { list, index } = locateBlock(next, pos);
  const cur = list[index];
  const { left, right } = splitInlines(onlyTextNodes(cur.content), pos.offset);

  if (blocks.length === 1) {
    const insNodes = onlyTextNodes(blocks[0].content);
    cur.content = normalizeInlines([...left, ...insNodes, ...right]);
    const newOffset = pos.offset + blockCharLen(insNodes);
    return { doc: next, sel: collapsedAt(pos, index, newOffset) };
  }

  const firstNodes = onlyTextNodes(blocks[0].content);
  const lastNodes = onlyTextNodes(blocks[blocks.length - 1].content);
  cur.content = normalizeInlines([...left, ...firstNodes]);

  const middle = blocks.slice(1, -1).map(cloneBlock);
  const lastSrc = blocks[blocks.length - 1];
  const rightBlock: BlockNodeData = {
    type: lastSrc.type,
    ...(lastSrc.attrs ? { attrs: JSON.parse(JSON.stringify(lastSrc.attrs)) } : {}),
    content: normalizeInlines([...lastNodes, ...right]),
  };
  list.splice(index + 1, 0, ...middle, rightBlock);

  const caretIndex = index + 1 + middle.length;
  return { doc: next, sel: collapsedAt(pos, caretIndex, blockCharLen(lastNodes)) };
}

// ---- list indent / outdent ----

// Write an `indent` level onto a list_item's attrs, dropping the key at level 0
// so a top-level item stays byte-identical to a never-indented one.
function setIndentAttr(block: BlockNodeData, indent: number): void {
  const attrs = { ...(block.attrs ?? {}) };
  if (indent > 0) attrs.indent = indent; else delete attrs.indent;
  block.attrs = attrs;
}

// Indent each selected top-level list_item one level, clamped so an item can
// never sit more than one level deeper than the item above it (which keeps the
// flat run serializable into well-formed nested <ul>/<ol>). No-op for cells or
// non-list blocks.
export function indentListItem(doc: DocData, sel: ModelSel): TxResult {
  const { start, end } = normalizedRange(sel);
  if (start.cell || end.cell) return { doc, sel };
  const next = cloneDoc(doc);
  for (let i = start.block; i <= end.block; i++) {
    const b = next.content[i];
    if (!b || b.type !== 'list_item') continue;
    const cur = b.attrs?.indent ?? 0;
    const prev = next.content[i - 1];
    const max = prev && prev.type === 'list_item' ? (prev.attrs?.indent ?? 0) + 1 : 0;
    setIndentAttr(b, Math.min(cur + 1, max));
  }
  return { doc: next, sel };
}

// Outdent each selected top-level list_item one level (floored at 0).
export function outdentListItem(doc: DocData, sel: ModelSel): TxResult {
  const { start, end } = normalizedRange(sel);
  if (start.cell || end.cell) return { doc, sel };
  const next = cloneDoc(doc);
  for (let i = start.block; i <= end.block; i++) {
    const b = next.content[i];
    if (!b || b.type !== 'list_item') continue;
    const cur = b.attrs?.indent ?? 0;
    setIndentAttr(b, Math.max(0, cur - 1));
  }
  return { doc: next, sel };
}

export function blockAt(doc: DocData, sel: ModelSel): { type: string; attrs: Record<string, any> | undefined } {
  const { list, index } = locateBlock(doc, sel.head);
  const block = list[index] ?? list[0];
  return { type: block.type, attrs: block.attrs };
}

// Plain concatenated text of the block a position addresses (no marks).
// Used by input rules to inspect what the user has typed so far.
export function blockText(doc: DocData, pos: ModelPos): string {
  const { list, index } = locateBlock(doc, pos);
  return onlyTextNodes(list[index]?.content ?? []).map(n => n.text).join('');
}

export function setBlockType(doc: DocData, sel: ModelSel, type: string, attrs?: Record<string, any>): TxResult {
  if (crossesContainerBoundary(sel.anchor, sel.head)) return { doc, sel };
  const { start, end } = normalizedRange(sel);
  const next = cloneDoc(doc);
  const { list, index: si } = locateBlock(next, start);
  const { index: ei } = locateBlock(next, end);

  for (let i = si; i <= ei; i++) {
    const block = list[i];
    block.type = type;
    if (attrs) block.attrs = { ...attrs };
    else delete block.attrs;

    // A code_block holds plain text only — flatten inline marks away.
    if (type === 'code_block') {
      const text = onlyTextNodes(block.content).map(n => n.text).join('');
      block.content = text ? [{ type: 'text', text }] : [];
    }
  }

  return { doc: next, sel };
}

// Merge a top-level block into the previous one (blockIndex - 1). Blocked
// at a table boundary: backspacing/deleting across a table edge is a no-op
// — tables are only removed via an explicit table command.
export function mergeBlock(doc: DocData, blockIndex: number): TxResult {
  if (blockIndex <= 0 || blockIndex >= doc.content.length) return { doc, sel: collapsed(blockIndex, 0) };
  const prevIndex = blockIndex - 1;
  if (doc.content[prevIndex].type === 'table' || doc.content[blockIndex].type === 'table') {
    return { doc, sel: collapsed(blockIndex, 0) };
  }
  const next = cloneDoc(doc);
  const prevNodes = onlyTextNodes(next.content[prevIndex].content);
  const curNodes = onlyTextNodes(next.content[blockIndex].content);
  const junction = blockCharLen(prevNodes);
  next.content[prevIndex].content = normalizeInlines([...prevNodes, ...curNodes]);
  next.content.splice(blockIndex, 1);
  return { doc: next, sel: collapsed(prevIndex, junction) };
}

// Merge block `index` into `index - 1` within the same table cell.
function mergeBlockInList(doc: DocData, pos: ModelPos, index: number): TxResult {
  const next = cloneDoc(doc);
  const { list } = locateBlock(next, pos);
  const prevIndex = index - 1;
  const prevNodes = onlyTextNodes(list[prevIndex].content);
  const curNodes = onlyTextNodes(list[index].content);
  const junction = blockCharLen(prevNodes);
  list[prevIndex].content = normalizeInlines([...prevNodes, ...curNodes]);
  list.splice(index, 1);
  return { doc: next, sel: collapsedAt(pos, prevIndex, junction) };
}

// ---- table operations ----

function emptyCell(): BlockNodeData {
  return { type: 'table_cell', content: [{ type: 'paragraph', content: [] }] };
}

function rowsOf(table: BlockNodeData): BlockNodeData[] {
  return table.content as BlockNodeData[];
}

function cellsOf(tableRow: BlockNodeData): BlockNodeData[] {
  return tableRow.content as BlockNodeData[];
}

export function insertTable(doc: DocData, sel: ModelSel, rows: number, cols: number): TxResult {
  const next = cloneDoc(doc);
  const blockIndex = sel.head.block;
  const table: BlockNodeData = {
    type: 'table',
    content: Array.from({ length: rows }, () => ({
      type: 'table_row',
      content: Array.from({ length: cols }, () => emptyCell()),
    })),
  };
  next.content[blockIndex] = table;
  const cellPos: ModelPos = { block: blockIndex, offset: 0, cell: { row: 0, col: 0, para: 0 } };
  return { doc: next, sel: { anchor: cellPos, head: cellPos } };
}

export function insertRow(doc: DocData, sel: ModelSel, position: 'before' | 'after'): TxResult {
  const pos = sel.head;
  if (!pos.cell) return { doc, sel };
  const next = cloneDoc(doc);
  const table = next.content[pos.block];
  const rowIdx = pos.cell.row;
  const cols = cellsOf(rowsOf(table)[rowIdx]).length;
  const newRow: BlockNodeData = { type: 'table_row', content: Array.from({ length: cols }, () => emptyCell()) };
  const insertAt = position === 'after' ? rowIdx + 1 : rowIdx;
  rowsOf(table).splice(insertAt, 0, newRow);
  return { doc: next, sel };
}

export function deleteRow(doc: DocData, sel: ModelSel): TxResult {
  const pos = sel.head;
  if (!pos.cell) return { doc, sel };
  const next = cloneDoc(doc);
  const table = next.content[pos.block];
  const rows = rowsOf(table);
  if (rows.length <= 1) {
    next.content.splice(pos.block, 1, { type: 'paragraph', content: [] });
    return { doc: next, sel: collapsed(pos.block, 0) };
  }
  rows.splice(pos.cell.row, 1);
  return { doc: next, sel };
}

export function insertColumn(doc: DocData, sel: ModelSel, position: 'before' | 'after'): TxResult {
  const pos = sel.head;
  if (!pos.cell) return { doc, sel };
  const next = cloneDoc(doc);
  const table = next.content[pos.block];
  const colIdx = pos.cell.col;
  const insertAt = position === 'after' ? colIdx + 1 : colIdx;
  for (const tableRow of rowsOf(table)) {
    cellsOf(tableRow).splice(insertAt, 0, emptyCell());
  }
  return { doc: next, sel };
}

export function deleteColumn(doc: DocData, sel: ModelSel): TxResult {
  const pos = sel.head;
  if (!pos.cell) return { doc, sel };
  const next = cloneDoc(doc);
  const table = next.content[pos.block];
  const rows = rowsOf(table);
  const colCount = cellsOf(rows[0]).length;
  if (colCount <= 1) {
    next.content.splice(pos.block, 1, { type: 'paragraph', content: [] });
    return { doc: next, sel: collapsed(pos.block, 0) };
  }
  for (const tableRow of rows) cellsOf(tableRow).splice(pos.cell.col, 1);
  return { doc: next, sel };
}

export function mergeCells(doc: DocData, sel: ModelSel): TxResult {
  const a = sel.anchor.cell;
  const h = sel.head.cell;
  if (!a || !h) return { doc, sel };

  const next = cloneDoc(doc);
  const blockIndex = sel.anchor.block;
  const table = next.content[blockIndex];
  const rows = rowsOf(table);

  const minRow = Math.min(a.row, h.row);
  const maxRow = Math.max(a.row, h.row);
  const minCol = Math.min(a.col, h.col);
  const maxCol = Math.max(a.col, h.col);

  const topLeft = cellsOf(rows[minRow])[minCol];
  const absorbed: BlockNodeData[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (r === minRow && c === minCol) continue;
      absorbed.push(...(cellsOf(rows[r])[c].content as BlockNodeData[]));
    }
  }
  topLeft.content = [...(topLeft.content as BlockNodeData[]), ...absorbed];
  topLeft.attrs = { ...(topLeft.attrs ?? {}), colspan: maxCol - minCol + 1, rowspan: maxRow - minRow + 1 };

  for (let r = maxRow; r >= minRow; r--) {
    for (let c = maxCol; c >= minCol; c--) {
      if (r === minRow && c === minCol) continue;
      cellsOf(rows[r]).splice(c, 1);
    }
  }

  const cellPos: ModelPos = { block: blockIndex, offset: 0, cell: { row: minRow, col: minCol, para: 0 } };
  return { doc: next, sel: { anchor: cellPos, head: cellPos } };
}

export function splitCell(doc: DocData, sel: ModelSel): TxResult {
  const pos = sel.head.cell;
  if (!pos) return { doc, sel };

  const next = cloneDoc(doc);
  const blockIndex = sel.head.block;
  const table = next.content[blockIndex];
  const rows = rowsOf(table);
  const target = cellsOf(rows[pos.row])[pos.col];
  const colspan = target.attrs?.colspan ?? 1;
  const rowspan = target.attrs?.rowspan ?? 1;
  if (colspan <= 1 && rowspan <= 1) return { doc, sel };

  target.attrs = { ...(target.attrs ?? {}), colspan: 1, rowspan: 1 };

  for (let r = pos.row; r < pos.row + rowspan; r++) {
    const cols = cellsOf(rows[r]);
    const insertCount = r === pos.row ? colspan - 1 : colspan;
    const insertAt = r === pos.row ? pos.col + 1 : pos.col;
    const newCells = Array.from({ length: insertCount }, () => emptyCell());
    cols.splice(insertAt, 0, ...newCells);
  }

  return { doc: next, sel };
}

export function deleteTable(doc: DocData, sel: ModelSel): TxResult {
  const blockIndex = sel.head.block;
  if (blockIndex < 0 || blockIndex >= doc.content.length) return { doc, sel };
  const next = cloneDoc(doc);
  next.content.splice(blockIndex, 1);
  return { doc: next, sel: collapsed(Math.max(0, blockIndex - 1), 0) };
}

export function toggleHeaderRow(doc: DocData, sel: ModelSel): TxResult {
  const pos = sel.head;
  if (!pos.cell) return { doc, sel };
  const next = cloneDoc(doc);
  const table = next.content[pos.block];
  const firstRow = rowsOf(table)[0];
  const turnOn = firstRow.attrs?.header !== true;
  firstRow.attrs = { ...(firstRow.attrs ?? {}), header: turnOn };
  for (const cell of cellsOf(firstRow)) {
    cell.attrs = { ...(cell.attrs ?? {}), header: turnOn };
  }
  return { doc: next, sel };
}

export function setColumnWidth(doc: DocData, tableBlock: number, col: number, width: number): DocData {
  const next = cloneDoc(doc);
  const table = next.content[tableBlock];
  for (const tableRow of rowsOf(table)) {
    const cell = cellsOf(tableRow)[col];
    cell.attrs = { ...(cell.attrs ?? {}), width };
  }
  return next;
}
