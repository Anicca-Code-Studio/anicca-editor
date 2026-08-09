import { describe, it, expect } from 'vitest';
import { defaultSchema } from './Schema.js';
import type { DocData } from './Model.js';

describe('defaultSchema table nodes', () => {
  it('allows table, table_row, table_cell node types', () => {
    expect(defaultSchema.isNodeAllowed('table')).toBe(true);
    expect(defaultSchema.isNodeAllowed('table_row')).toBe(true);
    expect(defaultSchema.isNodeAllowed('table_cell')).toBe(true);
  });

  it('declares table_cell attrs defaults', () => {
    const rule = defaultSchema.nodes['table_cell'];
    expect(rule.attrs).toEqual({ colspan: 1, rowspan: 1, width: null, header: false });
  });
});

describe('Schema.isAllowedInside', () => {
  it('honors the content model of each node', () => {
    expect(defaultSchema.isAllowedInside('doc', 'paragraph')).toBe(true);
    expect(defaultSchema.isAllowedInside('doc', 'text')).toBe(false);
    expect(defaultSchema.isAllowedInside('paragraph', 'text')).toBe(true);
    expect(defaultSchema.isAllowedInside('paragraph', 'paragraph')).toBe(false);
    expect(defaultSchema.isAllowedInside('table', 'table_row')).toBe(true);
    expect(defaultSchema.isAllowedInside('table', 'paragraph')).toBe(false);
    expect(defaultSchema.isAllowedInside('table_cell', 'paragraph')).toBe(true);
  });
});

describe('Schema.normalize', () => {
  it('guarantees a non-empty document', () => {
    const out = defaultSchema.normalize({ type: 'doc', content: [] });
    expect(out.content).toEqual([{ type: 'paragraph', content: [] }]);
  });

  it('rewrites unknown block types to paragraph', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'marquee', content: [{ type: 'text', text: 'x' }] }] };
    const out = defaultSchema.normalize(doc);
    expect(out.content[0].type).toBe('paragraph');
    expect(out.content[0].content).toEqual([{ type: 'text', text: 'x' }]);
  });

  it('drops marks that the schema does not declare', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'blink' }] }] }],
    };
    const out = defaultSchema.normalize(doc);
    expect(out.content[0].content).toEqual([{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }]);
  });

  it('strips all marks inside a code_block', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{ type: 'code_block', attrs: { language: '' }, content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }] }],
    };
    const out = defaultSchema.normalize(doc);
    expect(out.content[0].content).toEqual([{ type: 'text', text: 'x' }]);
  });

  it('recurses into table cells', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'table_row',
          content: [{
            type: 'table_cell',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c', marks: [{ type: 'blink' }] }] }],
          }],
        }],
      }],
    };
    const out = defaultSchema.normalize(doc);
    const cellPara = (out.content[0].content![0] as any).content[0].content[0].content[0];
    expect(cellPara).toEqual({ type: 'text', text: 'c' });
  });
});
