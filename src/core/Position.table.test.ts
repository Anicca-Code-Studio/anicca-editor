// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { domToModel, modelToDom } from './Position.js';

let editable: HTMLElement;

beforeEach(() => {
  editable = document.createElement('div');
  document.body.appendChild(editable);
});

function firstText(el: Node): Text {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  return w.nextNode() as Text;
}

const TABLE_HTML =
  '<table><tbody>' +
  '<tr><td><p>A</p></td><td><p>B</p></td></tr>' +
  '<tr><td><p>C</p></td><td><p>D</p></td></tr>' +
  '</tbody></table>';

describe('domToModel inside a table cell', () => {
  it('maps a caret in a cell paragraph to block=table index + cell coords', () => {
    editable.innerHTML = TABLE_HTML;
    const dCell = editable.querySelectorAll('td')[3]; // row1, col1 => "D"
    const t = firstText(dCell);
    expect(domToModel(editable, t, 1)).toEqual({ block: 0, offset: 1, cell: { row: 1, col: 1, para: 0 } });
  });

  it('counts the table as a single top-level block for content before/after it', () => {
    editable.innerHTML = `<p>Before</p>${TABLE_HTML}<p>After</p>`;
    const afterText = firstText(editable.querySelectorAll('p')[editable.querySelectorAll('p').length - 1]);
    // 1 paragraph before the table (index 0), table itself is index 1, "After" paragraph is index 2.
    expect(domToModel(editable, afterText, 2)).toEqual({ block: 2, offset: 2 });
  });

  it('resolves the local paragraph index for a multi-paragraph cell', () => {
    editable.innerHTML =
      '<table><tbody><tr><td><p>A1</p><p>A2</p></td><td><p>B</p></td></tr></tbody></table>';
    const secondPara = editable.querySelectorAll('td')[0].querySelectorAll('p')[1];
    const t = firstText(secondPara);
    expect(domToModel(editable, t, 1)).toEqual({ block: 0, offset: 1, cell: { row: 0, col: 0, para: 1 } });
  });
});

describe('modelToDom inside a table cell', () => {
  it('resolves a cell position back to the right text node', () => {
    editable.innerHTML = TABLE_HTML;
    const { node, offset } = modelToDom(editable, { block: 0, offset: 1, cell: { row: 1, col: 1, para: 0 } });
    expect(node.textContent).toBe('D');
    expect(offset).toBe(1);
  });

  it('resolves a position in the second paragraph of a multi-paragraph cell', () => {
    editable.innerHTML =
      '<table><tbody><tr><td><p>A1</p><p>A2</p></td><td><p>B</p></td></tr></tbody></table>';
    const { node, offset } = modelToDom(editable, { block: 0, offset: 1, cell: { row: 0, col: 0, para: 1 } });
    expect(node.textContent).toBe('A2');
    expect(offset).toBe(1);
  });
});

describe('round-trip through a table cell', () => {
  it('domToModel then modelToDom returns an equivalent caret', () => {
    editable.innerHTML = TABLE_HTML;
    const cCell = editable.querySelectorAll('td')[2]; // row1, col0 => "C"
    const t = firstText(cCell);
    const pos = domToModel(editable, t, 1);
    const dom = modelToDom(editable, pos);
    const back = domToModel(editable, dom.node, dom.offset);
    expect(back).toEqual(pos);
  });
});
