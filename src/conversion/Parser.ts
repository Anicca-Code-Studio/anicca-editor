import type { DocData, BlockNodeData, TextNodeData, MarkData } from '../core/Model.js';
import { emptyDoc } from '../core/Model.js';
import { sanitizeEmbedSrc } from '../core/sanitize.js';

const TAG_TO_MARK: Record<string, string> = {
  STRONG: 'bold', B: 'bold',
  EM: 'italic', I: 'italic',
  U: 'underline',
  S: 'strikethrough', STRIKE: 'strikethrough', DEL: 'strikethrough',
  CODE: 'code',
  MARK: 'highlight',
  SUP: 'superscript', SUB: 'subscript',
};

// Read inline color / background / font-size off an element's inline style into
// the model's attribute marks (so a pasted or loaded `<span style>` survives).
function styleMarks(el: Element): MarkData[] {
  const style = (el as HTMLElement).style;
  if (!style || style.length === 0) return [];
  const out: MarkData[] = [];
  if (style.color) out.push({ type: 'textColor', attrs: { color: style.color } });
  if (style.backgroundColor) out.push({ type: 'backgroundColor', attrs: { color: style.backgroundColor } });
  if (style.fontSize) out.push({ type: 'fontSize', attrs: { size: style.fontSize } });
  if (style.fontFamily) out.push({ type: 'fontFamily', attrs: { font: style.fontFamily } });
  return out;
}

// The block-level text-align value (or null), used to lift `text-align` off a
// paragraph / heading / blockquote into the model's `align` attr.
function alignOf(el: Element): 'center' | 'right' | 'justify' | null {
  const a = (el as HTMLElement).style?.textAlign;
  return a === 'center' || a === 'right' || a === 'justify' ? a : null;
}

// Build an image block's attrs from the <img> and its optional wrapping
// <figure>: src/alt always, plus width (img style width:NN%), align (figure
// text-align) and caption (figcaption text) when present.
function imageAttrs(img: Element, figure: Element | null): Record<string, any> {
  const attrs: Record<string, any> = {
    src: img.getAttribute('src') ?? '',
    alt: img.getAttribute('alt') ?? '',
  };
  const wm = (img as HTMLElement).style?.width?.match(/([\d.]+)%/);
  if (wm) attrs.width = parseFloat(wm[1]);
  if (figure) {
    const align = alignOf(figure);
    if (align) attrs.align = align;
    const cap = figure.querySelector('figcaption')?.textContent;
    if (cap) attrs.caption = cap;
  }
  return attrs;
}

// Block-level tags never contribute inline text: when one appears inside an
// inline context (e.g. a nested <ul> inside a list item's <li>, or a stray
// block encountered during block-scoped resync) it is skipped so its text is
// not hoisted into the surrounding block's inline content.
const BLOCK_TAGS = new Set([
  'UL', 'OL', 'LI', 'P', 'DIV', 'BLOCKQUOTE', 'PRE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'FIGURE', 'HR', 'IFRAME',
]);

function parseInlineNode(node: Node, marks: MarkData[]): TextNodeData[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (!text) return [];
    return [{ type: 'text', text, marks: marks.length ? [...marks] : undefined }];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = el.tagName;
  if (BLOCK_TAGS.has(tag)) return [];
  const newMarks = [...marks];

  if (TAG_TO_MARK[tag]) {
    newMarks.push({ type: TAG_TO_MARK[tag] });
  } else if (tag === 'A') {
    const href = el.getAttribute('href') ?? '';
    newMarks.push({ type: 'link', attrs: { href } });
  }
  newMarks.push(...styleMarks(el));

  const results: TextNodeData[] = [];
  for (const child of Array.from(el.childNodes)) {
    results.push(...parseInlineNode(child, newMarks));
  }
  return results;
}

function parseInlines(el: Element): TextNodeData[] {
  const results: TextNodeData[] = [];
  for (const child of Array.from(el.childNodes)) {
    results.push(...parseInlineNode(child, []));
  }
  return results;
}

// Public: parse just the inline children of a single block element into model
// text nodes. Used for block-scoped resync (IME / unhandled native edits) so
// the model stays the source of truth without reparsing the whole document.
export function parseInlineContent(el: Element): TextNodeData[] {
  return parseInlines(el);
}

function parseBlock(el: Element): BlockNodeData | null {
  const tag = el.tagName;

  if (tag === 'P') {
    const align = alignOf(el);
    return { type: 'paragraph', ...(align ? { attrs: { align } } : {}), content: parseInlines(el) };
  }
  if (/^H[1-6]$/.test(tag)) {
    const level = parseInt(tag[1], 10);
    const align = alignOf(el);
    const attrs: Record<string, any> = { level };
    if (align) attrs.align = align;
    return { type: 'heading', attrs, content: parseInlines(el) };
  }
  if (tag === 'BLOCKQUOTE') {
    const align = alignOf(el);
    return { type: 'blockquote', ...(align ? { attrs: { align } } : {}), content: parseInlines(el) };
  }
  if (tag === 'PRE') {
    const codeEl = el.querySelector('code');
    const langMatch = codeEl?.className.match(/language-(\S+)/);
    const language = langMatch ? langMatch[1] : '';
    const text = codeEl?.textContent ?? el.textContent ?? '';
    return {
      type: 'code_block',
      attrs: { language },
      content: text ? [{ type: 'text', text }] : [],
    };
  }
  if (tag === 'UL') {
    return {
      type: 'bullet_list',
      content: Array.from(el.querySelectorAll(':scope > li')).map(li => ({
        type: 'list_item',
        content: parseInlines(li as Element),
      })),
    };
  }
  if (tag === 'OL') {
    return {
      type: 'ordered_list',
      content: Array.from(el.querySelectorAll(':scope > li')).map(li => ({
        type: 'list_item',
        content: parseInlines(li as Element),
      })),
    };
  }
  if (tag === 'HR') {
    return { type: 'horizontal_rule' };
  }
  if (tag === 'IMG') {
    return { type: 'image', attrs: imageAttrs(el, null) };
  }
  if (tag === 'IFRAME') {
    const src = sanitizeEmbedSrc(el.getAttribute('src') ?? '');
    return src ? { type: 'embed', attrs: { src } } : null;
  }
  if (tag === 'FIGURE') {
    const iframe = el.querySelector('iframe');
    if (iframe) {
      const src = sanitizeEmbedSrc(iframe.getAttribute('src') ?? '');
      return src ? { type: 'embed', attrs: { src } } : null;
    }
    const img = el.querySelector('img');
    if (!img) return null;
    return { type: 'image', attrs: imageAttrs(img, el) };
  }
  if (tag === 'DIV' || tag === 'ARTICLE' || tag === 'SECTION') {
    return { type: 'paragraph', content: parseInlines(el) };
  }
  if (tag === 'TABLE') {
    return parseTable(el);
  }

  return null;
}

function parseTable(tableEl: Element): BlockNodeData {
  const rows: BlockNodeData[] = [];

  for (const trEl of Array.from(tableEl.querySelectorAll('tr'))) {
    const cells: BlockNodeData[] = [];
    let allHeaderCells = true;

    for (const cellEl of Array.from(trEl.children)) {
      const isHeader = cellEl.tagName === 'TH';
      if (!isHeader) allHeaderCells = false;

      const colspan = cellEl.hasAttribute('colspan') ? parseInt(cellEl.getAttribute('colspan')!, 10) : 1;
      const rowspan = cellEl.hasAttribute('rowspan') ? parseInt(cellEl.getAttribute('rowspan')!, 10) : 1;

      const attrs: Record<string, any> = {};
      if (colspan !== 1) attrs.colspan = colspan;
      if (rowspan !== 1) attrs.rowspan = rowspan;
      if (isHeader) attrs.header = true;

      cells.push({
        type: 'table_cell',
        ...(Object.keys(attrs).length ? { attrs } : {}),
        content: parseBlockChildren(cellEl),
      });
    }

    const rowIsHeader = trEl.parentElement?.tagName === 'THEAD' || (cells.length > 0 && allHeaderCells);
    rows.push({
      type: 'table_row',
      ...(rowIsHeader ? { attrs: { header: true } } : {}),
      content: cells,
    });
  }

  // Column widths live once on <colgroup><col>, but the model stores width
  // per-cell (every cell in a column carries the same width) — see
  // Transaction.setColumnWidth, which writes it the same way.
  const colgroup = tableEl.querySelector(':scope > colgroup');
  if (colgroup) {
    const widths = Array.from(colgroup.querySelectorAll('col')).map(col => {
      const m = col.getAttribute('style')?.match(/width:\s*([\d.]+)%/);
      return m ? parseFloat(m[1]) : null;
    });
    for (const row of rows) {
      (row.content as BlockNodeData[]).forEach((cell, i) => {
        const w = widths[i];
        if (w != null) cell.attrs = { ...(cell.attrs ?? {}), width: w };
      });
    }
  }

  return { type: 'table', content: rows };
}

// Flatten a (possibly nested) <ul>/<ol> into the model's flat list_item
// representation: one block per <li>, tagged with its `kind` and `indent`
// depth. A nested <ul>/<ol> inside an <li> recurses at indent+1, so the flat
// run round-trips with Serializer.serializeListRun. `indent` is omitted at 0.
function flattenList(listEl: Element, indent: number, out: BlockNodeData[]): void {
  const kind = listEl.tagName === 'OL' ? 'ordered' : 'bullet';
  for (const liEl of Array.from(listEl.querySelectorAll(':scope > li'))) {
    const inlineNodes: TextNodeData[] = [];
    const childLists: Element[] = [];
    for (const child of Array.from(liEl.childNodes)) {
      const tag = child.nodeType === Node.ELEMENT_NODE ? (child as Element).tagName : '';
      if (tag === 'UL' || tag === 'OL') childLists.push(child as Element);
      else inlineNodes.push(...parseInlineNode(child, []));
    }
    out.push({
      type: 'list_item',
      attrs: { kind, ...(indent ? { indent } : {}) },
      content: inlineNodes,
    });
    for (const cl of childLists) flattenList(cl, indent + 1, out);
  }
}

// Parse the block-level children of a container (document root or a table
// cell) the same way: flatten <ul>/<ol> into list_item blocks, delegate
// everything else to parseBlock, and fall back to a single (possibly
// text-wrapping) paragraph when there's no recognized block content.
function parseBlockChildren(container: Element): BlockNodeData[] {
  const blocks: BlockNodeData[] = [];
  for (const child of Array.from(container.children)) {
    const el = child as Element;
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      flattenList(el, 0, blocks);
      continue;
    }
    const block = parseBlock(el);
    if (block) blocks.push(block);
  }

  if (blocks.length === 0) {
    const text = container.textContent?.trim();
    if (text) {
      blocks.push({ type: 'paragraph', content: [{ type: 'text', text }] });
    } else {
      blocks.push({ type: 'paragraph', content: [] });
    }
  }

  return blocks;
}

export function parse(html: string): DocData {
  if (!html?.trim()) return emptyDoc();

  const div = document.createElement('div');
  div.innerHTML = html;

  return { type: 'doc', content: parseBlockChildren(div) };
}
