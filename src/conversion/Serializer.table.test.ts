// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type { DocData } from '../core/Model.js';
import { serialize } from './Serializer.js';
import { parse } from './Parser.js';

function cellPara(text: string): any {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

describe('serialize (table)', () => {
  it('serializes a basic table with tbody rows', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'table_row',
          content: [
            { type: 'table_cell', content: [cellPara('A')] },
            { type: 'table_cell', content: [cellPara('B')] },
          ],
        }],
      }],
    };
    expect(serialize(doc)).toBe('<table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table>');
  });

  it('serializes colspan/rowspan attrs and header cells as <th>', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'table_row',
          attrs: { header: true },
          content: [
            { type: 'table_cell', attrs: { header: true, colspan: 2, rowspan: 3 }, content: [cellPara('H')] },
          ],
        }, {
          type: 'table_row',
          content: [{ type: 'table_cell', content: [cellPara('A')] }],
        }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<thead><tr><th colspan="2" rowspan="3">');
    expect(html).toContain('<tbody><tr><td><p>A</p></td></tr></tbody>');
  });

  it('serializes column width via <colgroup><col style>', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'table_row',
          content: [
            { type: 'table_cell', attrs: { width: 30 }, content: [cellPara('A')] },
            { type: 'table_cell', attrs: { width: 70 }, content: [cellPara('B')] },
          ],
        }],
      }],
    };
    const html = serialize(doc);
    expect(html).toContain('<colgroup><col style="width:30%"><col style="width:70%"></colgroup>');
  });

  it('serializes a multi-paragraph cell as multiple <p> inside the cell', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'table_row',
          content: [{ type: 'table_cell', content: [cellPara('A1'), cellPara('A2')] }],
        }],
      }],
    };
    expect(serialize(doc)).toBe('<table><tbody><tr><td><p>A1</p><p>A2</p></td></tr></tbody></table>');
  });
});

describe('parse -> serialize round-trip (table)', () => {
  it('round-trips a table with header row, colspan and column widths', () => {
    const html =
      '<table><colgroup><col style="width:40%"><col style="width:60%"></colgroup>' +
      '<thead><tr><th><p>H1</p></th><th><p>H2</p></th></tr></thead>' +
      '<tbody><tr><td colspan="2"><p>A</p></td></tr></tbody></table>';
    expect(serialize(parse(html))).toBe(html);
  });
});
