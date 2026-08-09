import { describe, it, expect } from 'vitest';
import type { DocData, BlockNodeData } from '../core/Model.js';
import type { ModelSel } from '../core/Position.js';
import {
  tabForward, tabBackward, verticalMove,
  InsertTableCommand, InsertRowCommand, MergeCellsCommand, SplitCellCommand, ToggleHeaderRowCommand,
} from './TablePlugin.js';

function cellPara(text: string): BlockNodeData {
  return { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] };
}

function cell(text: string, attrs?: Record<string, any>): BlockNodeData {
  return { type: 'table_cell', ...(attrs ? { attrs } : {}), content: [cellPara(text)] };
}

function row(...cells: BlockNodeData[]): BlockNodeData {
  return { type: 'table_row', content: cells };
}

// 2x2 table: A B / C D
function table2x2(): BlockNodeData {
  return { type: 'table', content: [row(cell('A'), cell('B')), row(cell('C'), cell('D'))] };
}

describe('tabForward / tabBackward', () => {
  it('moves to the next cell in the same row', () => {
    expect(tabForward(table2x2(), 0, 0)).toEqual({ row: 0, col: 1 });
  });

  it('wraps to the first cell of the next row at the end of a row', () => {
    expect(tabForward(table2x2(), 0, 1)).toEqual({ row: 1, col: 0 });
  });

  it('returns null at the very last cell of the table', () => {
    expect(tabForward(table2x2(), 1, 1)).toBeNull();
  });

  it('moves to the previous cell in the same row', () => {
    expect(tabBackward(table2x2(), 0, 1)).toEqual({ row: 0, col: 0 });
  });

  it('wraps to the last cell of the previous row at the start of a row', () => {
    expect(tabBackward(table2x2(), 1, 0)).toEqual({ row: 0, col: 1 });
  });

  it('returns null at the very first cell of the table', () => {
    expect(tabBackward(table2x2(), 0, 0)).toBeNull();
  });
});

describe('verticalMove', () => {
  it('moves down to the same column in the next row', () => {
    expect(verticalMove(table2x2(), 0, 1, 1)).toEqual({ row: 1, col: 1 });
  });

  it('moves up to the same column in the previous row', () => {
    expect(verticalMove(table2x2(), 1, 0, -1)).toEqual({ row: 0, col: 0 });
  });

  it('returns null past the last row', () => {
    expect(verticalMove(table2x2(), 1, 0, 1)).toBeNull();
  });

  it('returns null before the first row', () => {
    expect(verticalMove(table2x2(), 0, 0, -1)).toBeNull();
  });

  it('clamps the column when the target row is shorter', () => {
    const t: BlockNodeData = { type: 'table', content: [row(cell('A'), cell('B')), row(cell('C'))] };
    expect(verticalMove(t, 0, 1, 1)).toEqual({ row: 1, col: 0 });
  });
});

function fakeHost(doc: DocData, sel: ModelSel) {
  const calls: Array<{ kind: string; result: any }> = [];
  return {
    doc, sel, calls,
    getDoc: () => doc,
    getSelectionModel: () => sel,
    applyOp: (op: any) => { calls.push({ kind: 'applyOp', result: op(doc, sel) }); },
    dispatch: (tr: any) => { calls.push({ kind: 'dispatch', result: tr }); },
    getEditable: () => null,
    on: () => {},
  };
}

function docWithTable(): DocData {
  return { type: 'doc', content: [table2x2()] };
}

describe('InsertTableCommand.refresh', () => {
  it('is enabled at a plain top-level paragraph', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    const sel: ModelSel = { anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 0 } };
    const cmd = new InsertTableCommand(fakeHost(doc, sel) as any);
    cmd.refresh();
    expect(cmd.isEnabled).toBe(true);
  });

  it('is disabled while already inside a table cell (no nested tables)', () => {
    const doc = docWithTable();
    const sel: ModelSel = { anchor: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } }, head: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } } };
    const cmd = new InsertTableCommand(fakeHost(doc, sel) as any);
    cmd.refresh();
    expect(cmd.isEnabled).toBe(false);
  });
});

describe('InsertRowCommand.refresh', () => {
  it('is disabled outside a table', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    const sel: ModelSel = { anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 0 } };
    const cmd = new InsertRowCommand(fakeHost(doc, sel) as any, 'after');
    cmd.refresh();
    expect(cmd.isEnabled).toBe(false);
  });

  it('is enabled inside a table cell', () => {
    const doc = docWithTable();
    const sel: ModelSel = { anchor: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } }, head: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } } };
    const cmd = new InsertRowCommand(fakeHost(doc, sel) as any, 'after');
    cmd.refresh();
    expect(cmd.isEnabled).toBe(true);
  });
});

describe('MergeCellsCommand.refresh', () => {
  it('is disabled for a collapsed single-cell selection', () => {
    const doc = docWithTable();
    const pos = { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } };
    const sel: ModelSel = { anchor: pos, head: pos };
    const cmd = new MergeCellsCommand(fakeHost(doc, sel) as any);
    cmd.refresh();
    expect(cmd.isEnabled).toBe(false);
  });

  it('is enabled for a selection spanning two different cells', () => {
    const doc = docWithTable();
    const sel: ModelSel = {
      anchor: { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } },
      head: { block: 0, offset: 0, cell: { row: 1, col: 1, para: 0 } },
    };
    const cmd = new MergeCellsCommand(fakeHost(doc, sel) as any);
    cmd.refresh();
    expect(cmd.isEnabled).toBe(true);
  });
});

describe('SplitCellCommand.refresh', () => {
  it('is disabled for a cell with no colspan/rowspan', () => {
    const doc = docWithTable();
    const pos = { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } };
    const sel: ModelSel = { anchor: pos, head: pos };
    const cmd = new SplitCellCommand(fakeHost(doc, sel) as any);
    cmd.refresh();
    expect(cmd.isEnabled).toBe(false);
  });

  it('is enabled for a merged cell (colspan > 1)', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{ type: 'table', content: [row(cell('A', { colspan: 2 }))] }],
    };
    const pos = { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } };
    const sel: ModelSel = { anchor: pos, head: pos };
    const cmd = new SplitCellCommand(fakeHost(doc, sel) as any);
    cmd.refresh();
    expect(cmd.isEnabled).toBe(true);
  });
});

describe('ToggleHeaderRowCommand.refresh', () => {
  it('reflects the current header state of the first row', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{ type: 'table', content: [row(cell('A', { header: true })), row(cell('B'))].map((r, i) => (i === 0 ? { ...r, attrs: { header: true } } : r)) }],
    };
    const pos = { block: 0, offset: 0, cell: { row: 0, col: 0, para: 0 } };
    const sel: ModelSel = { anchor: pos, head: pos };
    const cmd = new ToggleHeaderRowCommand(fakeHost(doc, sel) as any);
    cmd.refresh();
    expect(cmd.isEnabled).toBe(true);
    expect(cmd.value).toBe(true);
  });
});
