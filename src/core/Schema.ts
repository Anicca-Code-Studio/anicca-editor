import type { DocData, BlockNodeData, TextNodeData } from './Model.js';

export interface NodeRule {
  group?: string;
  content?: string;
  attrs?: Record<string, any>;
  inline?: boolean;
}

export interface MarkRule {
  attrs?: Record<string, any>;
}

export interface SchemaSpec {
  nodes: Record<string, NodeRule>;
  marks: Record<string, MarkRule>;
}

export class Schema {
  nodes: Record<string, NodeRule>;
  marks: Record<string, MarkRule>;

  constructor(spec: SchemaSpec) {
    this.nodes = spec.nodes;
    this.marks = spec.marks;
  }

  isMarkAllowed(markType: string): boolean {
    return markType in this.marks;
  }

  isNodeAllowed(nodeType: string): boolean {
    return nodeType in this.nodes;
  }

  // Whether `childType` may appear directly inside `parentType`, per the
  // parent's declared content expression (e.g. 'block+', 'inline*', 'text*').
  // A child matches by its own type name or by the group it belongs to.
  isAllowedInside(parentType: string, childType: string): boolean {
    const content = this.nodes[parentType]?.content;
    if (!content) return false;
    const childRule = this.nodes[childType];
    const bases = content.split(/\s+/).map(t => t.replace(/[+*?]$/, ''));
    return bases.some(base =>
      base === childType ||
      base === childRule?.group ||
      (base === 'text' && childType === 'text'),
    );
  }

  // Return a structurally valid copy of the document: guarantee at least one
  // block, rewrite unknown block types to paragraph, and drop marks the schema
  // does not declare (code_block holds plain text, so all marks are stripped).
  // This is the single enforcement point the editor runs after every change.
  normalize(doc: DocData): DocData {
    const content = doc.content.map(b => this._normalizeBlock(b));
    if (content.length === 0) content.push({ type: 'paragraph', content: [] });
    this._clampListIndents(content);
    return { type: 'doc', content };
  }

  // A run of consecutive list_item blocks carries indentation as a flat
  // `indent` level per item. Guarantee it stays serializable into well-formed
  // nesting: the first item of a run is level 0 and no item jumps more than one
  // level below the item above it.
  private _clampListIndents(content: BlockNodeData[]): void {
    let prev = -1; // -1 => previous block was not a list item
    for (const b of content) {
      if (b.type === 'list_item') {
        const raw = b.attrs?.indent ?? 0;
        const max = prev < 0 ? 0 : prev + 1;
        const clamped = Math.max(0, Math.min(raw, max));
        const attrs = { ...(b.attrs ?? {}) };
        if (clamped > 0) attrs.indent = clamped; else delete attrs.indent;
        b.attrs = attrs;
        prev = clamped;
      } else {
        prev = -1;
      }
    }
  }

  private _isContainer(type: string): boolean {
    return type === 'table' || type === 'table_row' || type === 'table_cell';
  }

  private _normalizeBlock(block: BlockNodeData): BlockNodeData {
    const type = this.isNodeAllowed(block.type) ? block.type : 'paragraph';
    const out: BlockNodeData = { type };
    if (block.attrs) out.attrs = block.attrs;
    if (block.content) {
      out.content = this._isContainer(type)
        ? (block.content as BlockNodeData[]).map(c => this._normalizeBlock(c))
        : this._normalizeInlines(block.content as TextNodeData[], type);
    }
    return out;
  }

  private _normalizeInlines(nodes: (TextNodeData | BlockNodeData)[], blockType: string): TextNodeData[] {
    const out: TextNodeData[] = [];
    for (const n of nodes) {
      if (n.type !== 'text') continue; // drop stray block nodes in inline context
      const node = n as TextNodeData;
      if (blockType === 'code_block' || !node.marks) {
        out.push({ type: 'text', text: node.text });
        continue;
      }
      const kept = node.marks.filter(m => this.isMarkAllowed(m.type));
      out.push(kept.length ? { type: 'text', text: node.text, marks: kept } : { type: 'text', text: node.text });
    }
    return out;
  }
}

export const defaultSchema = new Schema({
  nodes: {
    doc:           { content: 'block+' },
    paragraph:     { content: 'inline*', group: 'block' },
    heading:       { content: 'inline*', group: 'block', attrs: { level: 2 } },
    blockquote:    { content: 'block+', group: 'block' },
    code_block:    { content: 'text*', group: 'block', attrs: { language: '' }, inline: false },
    bullet_list:   { content: 'list_item+', group: 'block' },
    ordered_list:  { content: 'list_item+', group: 'block' },
    list_item:     { content: 'block+' },
    horizontal_rule: { group: 'block' },
    image:         { group: 'block', attrs: { src: '', alt: '', width: null, align: '', caption: '' } },
    embed:         { group: 'block', attrs: { src: '' } },
    table:         { content: 'table_row+', group: 'block' },
    table_row:     { content: 'table_cell+' },
    table_cell:    { content: 'block+', attrs: { colspan: 1, rowspan: 1, width: null, header: false } },
    text:          { group: 'inline', inline: true },
  },
  marks: {
    bold: {},
    italic: {},
    underline: {},
    strikethrough: {},
    code: {},
    link: { attrs: { href: '' } },
    highlight: {},
    superscript: {},
    subscript: {},
    textColor: { attrs: { color: '' } },
    backgroundColor: { attrs: { color: '' } },
    fontSize: { attrs: { size: '' } },
    fontFamily: { attrs: { font: '' } },
  },
});
