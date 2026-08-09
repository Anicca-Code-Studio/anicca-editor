import type { DocData, BlockNodeData, TextNodeData, MarkData } from '../core/Model.js';
import { sanitizeHref, sanitizeImageSrc, sanitizeEmbedSrc } from '../core/sanitize.js';

const MARK_TAGS: Record<string, [string, string]> = {
  bold:          ['<strong>', '</strong>'],
  italic:        ['<em>', '</em>'],
  underline:     ['<u>', '</u>'],
  strikethrough: ['<s>', '</s>'],
  code:          ['<code>', '</code>'],
  highlight:     ['<mark>', '</mark>'],
  superscript:   ['<sup>', '</sup>'],
  subscript:     ['<sub>', '</sub>'],
};

// Attribute marks that render as an inline <span> carrying a single CSS
// declaration. Each maps to [css property, attrs key holding the value].
const STYLE_MARKS: Record<string, [string, string]> = {
  textColor:       ['color', 'color'],
  backgroundColor: ['background-color', 'color'],
  fontSize:        ['font-size', 'size'],
  fontFamily:      ['font-family', 'font'],
};

function serializeText(node: TextNodeData): string {
  let text = escapeHtml(node.text);
  if (!node.marks?.length) return text;

  for (const mark of node.marks) {
    if (mark.type === 'link' && mark.attrs?.href) {
      const href = sanitizeHref(mark.attrs.href);
      if (href) text = `<a href="${escapeAttr(href)}">${text}</a>`;
      continue;
    }
    const style = STYLE_MARKS[mark.type];
    if (style) {
      const value = mark.attrs?.[style[1]];
      if (value) text = `<span style="${style[0]}:${escapeAttr(String(value))}">${text}</span>`;
      continue;
    }
    const tags = MARK_TAGS[mark.type];
    if (tags) text = `${tags[0]}${text}${tags[1]}`;
  }
  return text;
}

// A ` style="text-align:…"` fragment for a block carrying a non-default align
// attr, else ''. Shared by paragraph / heading / blockquote serialization.
const ALIGN_VALUES = new Set(['center', 'right', 'justify']);
function alignAttr(node: BlockNodeData): string {
  const a = node.attrs?.align;
  return a && ALIGN_VALUES.has(a) ? ` style="text-align:${a}"` : '';
}

function serializeInlines(content: (TextNodeData | BlockNodeData)[]): string {
  return content.map(n => {
    if (n.type === 'text') return serializeText(n as TextNodeData);
    return serializeBlock(n as BlockNodeData);
  }).join('');
}

function serializeBlock(node: BlockNodeData): string {
  const c = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
      return `<p${alignAttr(node)}>${serializeInlines(c)}</p>`;
    case 'heading': {
      const lvl = node.attrs?.level ?? 2;
      return `<h${lvl}${alignAttr(node)}>${serializeInlines(c)}</h${lvl}>`;
    }
    case 'blockquote':
      return `<blockquote${alignAttr(node)}>${serializeInlines(c)}</blockquote>`;
    case 'code_block': {
      const lang = node.attrs?.language ?? '';
      const cls = lang ? ` class="language-${escapeAttr(lang)}"` : '';
      return `<pre><code${cls}>${serializeInlines(c)}</code></pre>`;
    }
    case 'bullet_list':
      return `<ul>${serializeInlines(c)}</ul>`;
    case 'ordered_list':
      return `<ol>${serializeInlines(c)}</ol>`;
    case 'list_item':
      return `<li>${serializeInlines(c)}</li>`;
    case 'horizontal_rule':
      return `<hr>`;
    case 'image': {
      const src = sanitizeImageSrc(node.attrs?.src ?? '');
      const alt = escapeAttr(node.attrs?.alt ?? '');
      if (!src) return '';
      const width = node.attrs?.width;
      const imgStyle = width != null ? ` style="width:${width}%"` : '';
      const figStyle = alignAttr(node);
      const caption = node.attrs?.caption;
      const cap = caption ? `<figcaption>${escapeHtml(String(caption))}</figcaption>` : '';
      return `<figure contenteditable="false"${figStyle}><img src="${escapeAttr(src)}" alt="${alt}"${imgStyle}>${cap}</figure>`;
    }
    case 'embed': {
      const src = sanitizeEmbedSrc(node.attrs?.src ?? '');
      if (!src) return '';
      return `<figure class="embed" contenteditable="false"><iframe src="${escapeAttr(src)}" frameborder="0" allowfullscreen></iframe></figure>`;
    }
    case 'table':
      return serializeTable(node);
    default:
      return `<p>${serializeInlines(c)}</p>`;
  }
}

function serializeCell(cell: BlockNodeData): string {
  const tag = cell.attrs?.header ? 'th' : 'td';
  const colspan = cell.attrs?.colspan && cell.attrs.colspan !== 1 ? ` colspan="${cell.attrs.colspan}"` : '';
  const rowspan = cell.attrs?.rowspan && cell.attrs.rowspan !== 1 ? ` rowspan="${cell.attrs.rowspan}"` : '';
  const inner = (cell.content as BlockNodeData[] ?? []).map(serializeBlock).join('');
  return `<${tag}${colspan}${rowspan}>${inner}</${tag}>`;
}

function serializeRow(row: BlockNodeData): string {
  const cells = (row.content as BlockNodeData[] ?? []).map(serializeCell).join('');
  return `<tr>${cells}</tr>`;
}

function serializeTable(table: BlockNodeData): string {
  const rows = (table.content as BlockNodeData[]) ?? [];
  const colCount = rows[0]?.content?.length ?? 0;
  const widths: Array<number | null> = [];
  for (let i = 0; i < colCount; i++) {
    widths.push((rows[0]?.content?.[i] as BlockNodeData)?.attrs?.width ?? null);
  }
  const colgroup = widths.some(w => w != null)
    ? `<colgroup>${widths.map(w => `<col${w != null ? ` style="width:${w}%"` : ''}>`).join('')}</colgroup>`
    : '';

  const firstIsHeader = rows[0]?.attrs?.header === true;
  const body = firstIsHeader
    ? `<thead>${serializeRow(rows[0])}</thead><tbody>${rows.slice(1).map(serializeRow).join('')}</tbody>`
    : `<tbody>${rows.map(serializeRow).join('')}</tbody>`;

  return `<table>${colgroup}${body}</table>`;
}

function listKind(block: BlockNodeData): 'bullet' | 'ordered' {
  return block.attrs?.kind === 'ordered' ? 'ordered' : 'bullet';
}

function indentOf(block: BlockNodeData): number {
  return block.attrs?.indent ?? 0;
}

// Turn a flat run of consecutive list_item blocks (each tagged with a `kind`
// and an `indent` level) into properly nested <ul>/<ol> markup. A deeper item
// nests inside the previous <li>; a change of kind at the same level starts a
// sibling list, matching the historical flat-list behaviour at level 0.
function serializeListRun(items: BlockNodeData[]): string {
  let i = 0;
  const build = (level: number): string => {
    let html = '';
    while (i < items.length && indentOf(items[i]) >= level) {
      const kind = listKind(items[i]);
      const tag = kind === 'ordered' ? 'ol' : 'ul';
      html += `<${tag}>`;
      while (i < items.length && indentOf(items[i]) === level && listKind(items[i]) === kind) {
        html += `<li>${serializeInlines(items[i].content ?? [])}`;
        i++;
        if (i < items.length && indentOf(items[i]) > level) html += build(level + 1);
        html += `</li>`;
      }
      html += `</${tag}>`;
    }
    return html;
  };
  return build(0);
}

export function serialize(doc: DocData): string {
  const blocks = doc.content;
  const out: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].type === 'list_item') {
      const run: BlockNodeData[] = [];
      while (i < blocks.length && blocks[i].type === 'list_item') { run.push(blocks[i]); i++; }
      out.push(serializeListRun(run));
    } else {
      out.push(serializeBlock(blocks[i]));
      i++;
    }
  }
  return out.join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, '&quot;');
}
