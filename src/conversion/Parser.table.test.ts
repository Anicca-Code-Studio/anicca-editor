// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parse } from './Parser.js';

describe('parse (table)', () => {
  it('parses a basic table into table/table_row/table_cell blocks', () => {
    const html = '<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>';
    const doc = parse(html);
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe('table');
    const table = doc.content[0];
    expect(table.content).toHaveLength(1);
    expect(table.content![0].type).toBe('table_row');
    expect(table.content![0].content).toHaveLength(2);
    expect(table.content![0].content![0]).toEqual({
      type: 'table_cell',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
    });
  });

  it('parses colspan/rowspan into cell attrs', () => {
    const html = '<table><tbody><tr><td colspan="2" rowspan="3"><p>A</p></td></tr></tbody></table>';
    const doc = parse(html);
    const cell = doc.content[0].content![0].content![0];
    expect(cell.attrs).toMatchObject({ colspan: 2, rowspan: 3 });
  });

  it('marks a <thead> row and its <th> cells as header', () => {
    const html = '<table><thead><tr><th><p>H</p></th></tr></thead><tbody><tr><td><p>A</p></td></tr></tbody></table>';
    const doc = parse(html);
    const table = doc.content[0];
    expect(table.content![0].attrs?.header).toBe(true);
    expect(table.content![0].content![0].attrs?.header).toBe(true);
    expect(table.content![1].attrs?.header ?? false).toBe(false);
  });

  it('reads column width from <colgroup><col style> and applies it to every cell in that column', () => {
    const html =
      '<table><colgroup><col style="width:30%"><col style="width:70%"></colgroup>' +
      '<tbody><tr><td><p>A</p></td><td><p>B</p></td></tr><tr><td><p>C</p></td><td><p>D</p></td></tr></tbody></table>';
    const doc = parse(html);
    const table = doc.content[0];
    expect(table.content![0].content![0].attrs?.width).toBe(30);
    expect(table.content![0].content![1].attrs?.width).toBe(70);
    expect(table.content![1].content![0].attrs?.width).toBe(30);
  });

  it('parses a cell with multiple paragraphs into a multi-block cell', () => {
    const html = '<table><tbody><tr><td><p>A1</p><p>A2</p></td></tr></tbody></table>';
    const doc = parse(html);
    const cell = doc.content[0].content![0].content![0];
    expect(cell.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'A1' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A2' }] },
    ]);
  });

  it('falls back to a single empty paragraph for a truly empty cell', () => {
    const html = '<table><tbody><tr><td></td></tr></tbody></table>';
    const doc = parse(html);
    const cell = doc.content[0].content![0].content![0];
    expect(cell.content).toEqual([{ type: 'paragraph', content: [] }]);
  });
});
