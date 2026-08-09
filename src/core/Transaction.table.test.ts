import { describe, it, expect } from 'vitest';
import type { DocData, BlockNodeData } from './Model.js';
import {
  insertText, deleteRange, deleteBackward, deleteForward, splitBlock, mergeBlock,
  insertTable, insertRow, deleteRow, insertColumn, deleteColumn,
  mergeCells, splitCell, deleteTable, toggleHeaderRow, setColumnWidth,
  toggleMark, rangeHasMark,
} from './Transaction.js';
import type { ModelSel } from './Position.js';

function cellPara(text: string): BlockNodeData {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function cell(text: string, attrs?: Record<string, any>): BlockNodeData {
  return { type: 'table_cell', ...(attrs ? { attrs } : {}), content: [cellPara(text)] };
}

function row(...cells: BlockNodeData[]): BlockNodeData {
  return { type: 'table_row', content: cells };
}

// 2x2 table at doc.content[0]: A B / C D
function docWithTable(): DocData {
  return {
    type: 'doc',
    content: [
      { type: 'table', content: [row(cell('A'), cell('B')), row(cell('C'), cell('D'))] },
    ],
  };
}

function cellSel(row: number, col: number, para: number, offset: number): ModelSel {
  const pos = { block: 0, offset, cell: { row, col, para } };
  return { anchor: pos, head: pos };
}

describe('insertTable', () => {
  it('inserts a rows x cols table at the current block, replacing an empty paragraph', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    const res = insertTable(doc, { anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 0 } }, 2, 3);
    expect(res.doc.content[0].type).toBe('table');
    const table = res.doc.content[0];
    expect(table.content).toHaveLength(2);
    expect(table.content![0].content).toHaveLength(3);
    for (const r of table.content!) {
      for (const c of r.content!) {
        expect(c.type).toBe('table_cell');
        expect(c.content).toEqual([{ type: 'paragraph', content: [] }]);
      }
    }
  });
});

describe('cell-aware insertText', () => {
  it('inserts text into the targeted cell paragraph without touching other cells', () => {
    const doc = docWithTable();
    const res = insertText(doc, cellSel(0, 0, 0, 1), 'X');
    const table = res.doc.content[0];
    expect(table.content![0].content![0].content![0].content).toEqual([{ type: 'text', text: 'AX' }]);
    // untouched sibling cell
    expect(table.content![0].content![1].content).toEqual([cellPara('B')]);
    expect(res.sel.head).toEqual({ block: 0, offset: 2, cell: { row: 0, col: 0, para: 0 } });
  });
});

describe('cell-aware splitBlock / mergeBlock', () => {
  it('splitBlock creates a second paragraph inside the cell', () => {
    const doc = docWithTable();
    const res = splitBlock(doc, cellSel(0, 0, 0, 1));
    const cellA = res.doc.content[0].content![0].content![0];
    expect(cellA.content).toHaveLength(2);
    expect(cellA.content![0].content).toEqual([{ type: 'text', text: 'A' }]);
    expect(cellA.content![1].content).toEqual([]);
    expect(res.sel.head).toEqual({ block: 0, offset: 0, cell: { row: 0, col: 0, para: 1 } });
  });

  it('mergeBlock joins the second paragraph back into the first inside the same cell', () => {
    const doc = docWithTable();
    const split = splitBlock(doc, cellSel(0, 0, 0, 1));
    // backspace at start of the new (second) paragraph merges it up
    const res = deleteBackward(split.doc, split.sel);
    const cellA = res.doc.content[0].content![0].content![0];
    expect(cellA.content).toHaveLength(1);
    expect(cellA.content![0].content).toEqual([{ type: 'text', text: 'A' }]);
  });

  it('backspace at the very start of a cell (first paragraph, offset 0) is a no-op', () => {
    const doc = docWithTable();
    const res = deleteBackward(doc, cellSel(0, 0, 0, 0));
    expect(res.doc).toEqual(doc);
  });

  it('deleteForward at the very end of a cell (last paragraph, last offset) is a no-op', () => {
    const doc = docWithTable();
    const res = deleteForward(doc, cellSel(0, 0, 0, 1));
    expect(res.doc).toEqual(doc);
  });
});

describe('table boundary safety at top level', () => {
  it('backspace from a paragraph right after a table does not merge into the table', () => {
    const doc: DocData = {
      type: 'doc',
      content: [
        { type: 'table', content: [row(cell('A'))] },
        { type: 'paragraph', content: [] },
      ],
    };
    const res = deleteBackward(doc, { anchor: { block: 1, offset: 0 }, head: { block: 1, offset: 0 } });
    expect(res.doc).toEqual(doc);
  });
});

describe('cross-cell text ranges are a safe no-op', () => {
  it('deleteRange across two different cells does not touch the document', () => {
    const doc = docWithTable();
    const sel: ModelSel = {
      anchor: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } },
      head: { block: 0, offset: 1, cell: { row: 0, col: 1, para: 0 } },
    };
    const res = deleteRange(doc, sel);
    expect(res.doc).toEqual(doc);
  });

  it('toggleMark across two different cells does not touch the document', () => {
    const doc = docWithTable();
    const sel: ModelSel = {
      anchor: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } },
      head: { block: 0, offset: 1, cell: { row: 0, col: 1, para: 0 } },
    };
    const res = toggleMark(doc, sel, 'bold');
    expect(res.doc).toEqual(doc);
    expect(rangeHasMark(doc, sel, 'bold')).toBe(false);
  });

  it('a range from inside a cell to top-level content is a no-op', () => {
    const doc: DocData = {
      type: 'doc',
      content: [
        { type: 'table', content: [row(cell('A'))] },
        { type: 'paragraph', content: [{ type: 'text', text: 'X' }] },
      ],
    };
    const sel: ModelSel = {
      anchor: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } },
      head: { block: 1, offset: 1 },
    };
    const res = deleteRange(doc, sel);
    expect(res.doc).toEqual(doc);
  });
});

describe('insertRow / deleteRow', () => {
  it('inserts an empty row after the current row', () => {
    const doc = docWithTable();
    const res = insertRow(doc, cellSel(0, 0, 0, 0), 'after');
    const table = res.doc.content[0];
    expect(table.content).toHaveLength(3);
    expect(table.content![1].content).toHaveLength(2);
    expect(table.content![1].content![0].content).toEqual([{ type: 'paragraph', content: [] }]);
    // original second row (C D) shifted to index 2
    expect(table.content![2].content![0].content![0].content).toEqual([{ type: 'text', text: 'C' }]);
  });

  it('deletes the current row', () => {
    const doc = docWithTable();
    const res = deleteRow(doc, cellSel(0, 0, 0, 0));
    const table = res.doc.content[0];
    expect(table.content).toHaveLength(1);
    expect(table.content![0].content![0].content![0].content).toEqual([{ type: 'text', text: 'C' }]);
  });

  it('deleting the last remaining row deletes the whole table', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'table', content: [row(cell('A'))] }] };
    const res = deleteRow(doc, cellSel(0, 0, 0, 0));
    expect(res.doc.content[0].type).not.toBe('table');
  });
});

describe('insertColumn / deleteColumn', () => {
  it('inserts an empty column after the current column, in every row', () => {
    const doc = docWithTable();
    const res = insertColumn(doc, cellSel(0, 0, 0, 0), 'after');
    const table = res.doc.content[0];
    expect(table.content![0].content).toHaveLength(3);
    expect(table.content![1].content).toHaveLength(3);
    expect(table.content![0].content![1].content).toEqual([{ type: 'paragraph', content: [] }]);
    expect(table.content![0].content![2].content![0].content).toEqual([{ type: 'text', text: 'B' }]);
  });

  it('deletes the current column from every row', () => {
    const doc = docWithTable();
    const res = deleteColumn(doc, cellSel(0, 0, 0, 0));
    const table = res.doc.content[0];
    expect(table.content![0].content).toHaveLength(1);
    expect(table.content![0].content![0].content![0].content).toEqual([{ type: 'text', text: 'B' }]);
    expect(table.content![1].content![0].content![0].content).toEqual([{ type: 'text', text: 'D' }]);
  });

  it('deleting the last remaining column deletes the whole table', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'table', content: [row(cell('A'))] }] };
    const res = deleteColumn(doc, cellSel(0, 0, 0, 0));
    expect(res.doc.content[0].type).not.toBe('table');
  });
});

describe('mergeCells / splitCell', () => {
  it('merges a rectangular selection of cells into one, setting colspan/rowspan', () => {
    const doc = docWithTable();
    const anchor = { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } };
    const head = { block: 0, offset: 0, cell: { row: 1, col: 1, para: 0 } };
    const res = mergeCells(doc, { anchor, head });
    const table = res.doc.content[0];
    expect(table.content![0].content).toHaveLength(1);
    expect(table.content![0].content![0].attrs).toMatchObject({ colspan: 2, rowspan: 2 });
    expect(table.content![1].content).toHaveLength(0);
  });

  it('splits a merged cell back into colspan x rowspan separate cells', () => {
    const doc = docWithTable();
    const merged = mergeCells(doc, {
      anchor: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } },
      head: { block: 0, offset: 0, cell: { row: 1, col: 1, para: 0 } },
    });
    const res = splitCell(merged.doc, cellSel(0, 0, 0, 0));
    const table = res.doc.content[0];
    expect(table.content![0].content).toHaveLength(2);
    expect(table.content![1].content).toHaveLength(2);
    expect(table.content![0].content![0].attrs?.colspan ?? 1).toBe(1);
  });
});

describe('deleteTable', () => {
  it('removes the table block entirely', () => {
    const doc = docWithTable();
    const res = deleteTable(doc, cellSel(0, 0, 0, 0));
    expect(res.doc.content).toHaveLength(0);
  });
});

describe('toggleHeaderRow', () => {
  it('marks the first row and its cells as header, then toggles back off', () => {
    const doc = docWithTable();
    const on = toggleHeaderRow(doc, cellSel(0, 0, 0, 0));
    const table = on.doc.content[0];
    expect(table.content![0].attrs?.header).toBe(true);
    expect(table.content![0].content!.every(c => c.attrs?.header === true)).toBe(true);
    expect(table.content![1].attrs?.header ?? false).toBe(false);

    const off = toggleHeaderRow(on.doc, cellSel(0, 0, 0, 0));
    expect(off.doc.content[0].content![0].attrs?.header ?? false).toBe(false);
  });
});

describe('setColumnWidth', () => {
  it('sets width attr on every cell in the given column', () => {
    const doc = docWithTable();
    const res = setColumnWidth(doc, 0, 1, 30);
    const table = res.content[0];
    expect(table.content![0].content![1].attrs?.width).toBe(30);
    expect(table.content![1].content![1].attrs?.width).toBe(30);
    expect(table.content![0].content![0].attrs?.width ?? null).toBe(null);
  });
});
