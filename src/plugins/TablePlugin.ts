import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import type { BlockNodeData } from '../core/Model.js';
import type { ModelPos, ModelSel } from '../core/Position.js';
import { writeSelection, topLevelBlockIndexOf } from '../core/Position.js';
import {
  insertTable, insertRow, deleteRow, insertColumn, deleteColumn,
  mergeCells, splitCell, deleteTable, toggleHeaderRow, setColumnWidth,
} from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

/** Minimal surface a Table command needs from Editor, kept narrow so command
 *  logic (enable/disable, navigation) can be unit tested without a real DOM editor. */
export interface TableHost {
  getDoc(): { content: BlockNodeData[] };
  getSelectionModel(): ModelSel;
  applyOp(op: (doc: any, sel: ModelSel) => any, opts?: { coalesce?: boolean }): void;
  dispatch(tr: { doc: any; sel: ModelSel }, opts?: { coalesce?: boolean }): void;
}

function cellPosOf(sel: ModelSel): ModelPos['cell'] | undefined {
  return sel.head.cell;
}

function tableAt(host: TableHost, sel: ModelSel): BlockNodeData | null {
  if (!sel.head.cell) return null;
  return host.getDoc().content[sel.head.block] ?? null;
}

// ---- pure cell-navigation helpers (no DOM — directly unit-testable) ----

export function tabForward(table: BlockNodeData, row: number, col: number): { row: number; col: number } | null {
  const rows = table.content as BlockNodeData[];
  const cols = (rows[row].content as BlockNodeData[]).length;
  if (col + 1 < cols) return { row, col: col + 1 };
  if (row + 1 < rows.length) return { row: row + 1, col: 0 };
  return null;
}

export function tabBackward(table: BlockNodeData, row: number, col: number): { row: number; col: number } | null {
  const rows = table.content as BlockNodeData[];
  if (col - 1 >= 0) return { row, col: col - 1 };
  if (row - 1 >= 0) return { row: row - 1, col: (rows[row - 1].content as BlockNodeData[]).length - 1 };
  return null;
}

export function verticalMove(table: BlockNodeData, row: number, col: number, dir: 1 | -1): { row: number; col: number } | null {
  const rows = table.content as BlockNodeData[];
  const r = row + dir;
  if (r < 0 || r >= rows.length) return null;
  const targetCols = (rows[r].content as BlockNodeData[]).length;
  return { row: r, col: Math.min(col, targetCols - 1) };
}

// ---- commands ----

export class InsertTableCommand extends Command {
  private _popup: HTMLElement | null = null;

  execute(attrs?: Record<string, any>): void {
    if (attrs?.rows && attrs?.cols) {
      this.editor.applyOp((doc, sel) => insertTable(doc, sel, attrs.rows, attrs.cols));
      this._closePopup();
      return;
    }
    this._openPopup();
  }

  refresh(): void {
    this.isEnabled = !cellPosOf(this.editor.getSelectionModel());
  }

  private _openPopup(): void {
    this._closePopup();
    const editable = (this.editor as any).getEditable?.();
    const container = editable?.parentElement;
    if (!container) return;

    const MAX = 8;
    const wrap = document.createElement('div');
    wrap.className = 'anicca-table-popup';
    wrap.style.cssText = 'position:absolute;z-index:20;padding:8px;border:1px solid #99a;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15);border-radius:4px;';

    const label = document.createElement('div');
    label.style.cssText = 'font-size:12px;margin-bottom:6px;color:#556;';
    label.textContent = '1 x 1';

    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${MAX},16px);grid-template-rows:repeat(${MAX},16px);gap:2px;`;

    const cells: HTMLElement[] = [];
    const paint = (hr: number, hc: number) => {
      label.textContent = `${hr + 1} x ${hc + 1}`;
      for (const cellEl of cells) {
        const r = Number(cellEl.dataset.row);
        const c = Number(cellEl.dataset.col);
        cellEl.style.background = r <= hr && c <= hc ? '#8899ee' : '#f4f6ff';
      }
    };

    for (let r = 0; r < MAX; r++) {
      for (let c = 0; c < MAX; c++) {
        const cellEl = document.createElement('div');
        cellEl.style.cssText = 'width:16px;height:16px;border:1px solid #ccd;background:#f4f6ff;cursor:pointer;';
        cellEl.dataset.row = String(r);
        cellEl.dataset.col = String(c);
        cellEl.addEventListener('mousemove', () => paint(r, c));
        cellEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.execute({ rows: r + 1, cols: c + 1 });
        });
        cells.push(cellEl);
        grid.appendChild(cellEl);
      }
    }

    wrap.appendChild(label);
    wrap.appendChild(grid);
    if (!container.style.position) container.style.position = 'relative';
    container.appendChild(wrap);
    this._popup = wrap;

    const onDocMouseDown = (e: MouseEvent) => {
      if (!wrap.contains(e.target as Node)) {
        this._closePopup();
        document.removeEventListener('mousedown', onDocMouseDown);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', onDocMouseDown), 0);
  }

  private _closePopup(): void {
    this._popup?.remove();
    this._popup = null;
  }
}

export class InsertRowCommand extends Command {
  constructor(editor: any, private position: 'before' | 'after') { super(editor); }
  execute(): void {
    this.editor.applyOp((doc: any, sel: ModelSel) => insertRow(doc, sel, this.position));
  }
  refresh(): void {
    this.isEnabled = !!cellPosOf(this.editor.getSelectionModel());
  }
}

export class DeleteRowCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc: any, sel: ModelSel) => deleteRow(doc, sel));
  }
  refresh(): void {
    this.isEnabled = !!cellPosOf(this.editor.getSelectionModel());
  }
}

export class InsertColumnCommand extends Command {
  constructor(editor: any, private position: 'before' | 'after') { super(editor); }
  execute(): void {
    this.editor.applyOp((doc: any, sel: ModelSel) => insertColumn(doc, sel, this.position));
  }
  refresh(): void {
    this.isEnabled = !!cellPosOf(this.editor.getSelectionModel());
  }
}

export class DeleteColumnCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc: any, sel: ModelSel) => deleteColumn(doc, sel));
  }
  refresh(): void {
    this.isEnabled = !!cellPosOf(this.editor.getSelectionModel());
  }
}

export class MergeCellsCommand extends Command {
  execute(): void {
    const sel = this.editor.getSelectionModel();
    this.editor.dispatch(mergeCells(this.editor.getDoc(), sel));
  }
  refresh(): void {
    const sel = this.editor.getSelectionModel();
    const a = sel.anchor.cell;
    const h = sel.head.cell;
    this.isEnabled = !!a && !!h && sel.anchor.block === sel.head.block && (a.row !== h.row || a.col !== h.col);
  }
}

export class SplitCellCommand extends Command {
  execute(): void {
    const sel = this.editor.getSelectionModel();
    this.editor.dispatch(splitCell(this.editor.getDoc(), sel));
  }
  refresh(): void {
    const sel = this.editor.getSelectionModel();
    const c = cellPosOf(sel);
    if (!c) { this.isEnabled = false; return; }
    const table = tableAt(this.editor as unknown as TableHost, sel);
    const tableRow = (table?.content as BlockNodeData[] | undefined)?.[c.row];
    const cell = (tableRow?.content as BlockNodeData[] | undefined)?.[c.col];
    const colspan = cell?.attrs?.colspan ?? 1;
    const rowspan = cell?.attrs?.rowspan ?? 1;
    this.isEnabled = colspan > 1 || rowspan > 1;
  }
}

export class DeleteTableCommand extends Command {
  execute(): void {
    const sel = this.editor.getSelectionModel();
    this.editor.dispatch(deleteTable(this.editor.getDoc(), sel));
  }
  refresh(): void {
    this.isEnabled = !!cellPosOf(this.editor.getSelectionModel());
  }
}

export class ToggleHeaderRowCommand extends Command {
  execute(): void {
    const sel = this.editor.getSelectionModel();
    this.editor.dispatch(toggleHeaderRow(this.editor.getDoc(), sel));
  }
  refresh(): void {
    const sel = this.editor.getSelectionModel();
    this.isEnabled = !!cellPosOf(sel);
    const table = tableAt(this.editor as unknown as TableHost, sel);
    this.value = (table?.content as BlockNodeData[] | undefined)?.[0]?.attrs?.header === true;
  }
}

// ---- plugin ----

export class TablePlugin extends Plugin {
  static readonly pluginName = 'Table';
  private _resizeState: { table: HTMLTableElement; col: number; startX: number; startWidth: number; tableWidth: number; liveWidth: number | null } | null = null;
  private _onDocMove = (e: MouseEvent) => this._handleResizeMove(e);
  private _onDocUp = () => this._commitResize();

  init(): void {
    this.editor.registerCommand('insertTable', new InsertTableCommand(this.editor));
    this.editor.registerCommand('insertRowAfter', new InsertRowCommand(this.editor, 'after'));
    this.editor.registerCommand('insertRowBefore', new InsertRowCommand(this.editor, 'before'));
    this.editor.registerCommand('deleteRow', new DeleteRowCommand(this.editor));
    this.editor.registerCommand('insertColumnAfter', new InsertColumnCommand(this.editor, 'after'));
    this.editor.registerCommand('insertColumnBefore', new InsertColumnCommand(this.editor, 'before'));
    this.editor.registerCommand('deleteColumn', new DeleteColumnCommand(this.editor));
    this.editor.registerCommand('mergeCells', new MergeCellsCommand(this.editor));
    this.editor.registerCommand('splitCell', new SplitCellCommand(this.editor));
    this.editor.registerCommand('deleteTable', new DeleteTableCommand(this.editor));
    this.editor.registerCommand('toggleHeaderRow', new ToggleHeaderRowCommand(this.editor));

    this.editor.registerToolbarItem({ name: 'insertTable', label: 'Table', icon: icons.table, command: 'insertTable', tooltip: 'Insert table', group: 'table' });
    this.editor.registerToolbarItem({ name: 'insertRowAfter', label: 'Add row', icon: icons.rowAdd, command: 'insertRowAfter', tooltip: 'Insert row after', group: 'table' });
    this.editor.registerToolbarItem({ name: 'deleteRow', label: 'Delete row', icon: icons.rowDelete, command: 'deleteRow', tooltip: 'Delete row', group: 'table' });
    this.editor.registerToolbarItem({ name: 'insertColumnAfter', label: 'Add column', icon: icons.colAdd, command: 'insertColumnAfter', tooltip: 'Insert column after', group: 'table' });
    this.editor.registerToolbarItem({ name: 'deleteColumn', label: 'Delete column', icon: icons.colDelete, command: 'deleteColumn', tooltip: 'Delete column', group: 'table' });
    this.editor.registerToolbarItem({ name: 'mergeCells', label: 'Merge cells', icon: icons.mergeCells, command: 'mergeCells', tooltip: 'Merge cells', group: 'table' });
    this.editor.registerToolbarItem({ name: 'splitCell', label: 'Split cell', icon: icons.splitCells, command: 'splitCell', tooltip: 'Split cell', group: 'table' });
    this.editor.registerToolbarItem({ name: 'toggleHeaderRow', label: 'Header row', icon: icons.headerRow, command: 'toggleHeaderRow', tooltip: 'Toggle header row', group: 'table' });
    this.editor.registerToolbarItem({ name: 'deleteTable', label: 'Delete table', icon: icons.tableDelete, command: 'deleteTable', tooltip: 'Delete table', group: 'table' });

    this.editor.on('keydown', (e: KeyboardEvent) => this._handleKeydown(e));
    this._installResize();
  }

  destroy(): void {
    document.removeEventListener('mousemove', this._onDocMove);
    document.removeEventListener('mouseup', this._onDocUp);
  }

  private _handleKeydown(e: KeyboardEvent): void {
    const sel = this.editor.getSelectionModel();
    const cell = cellPosOf(sel);
    if (!cell) return;
    const table = tableAt(this.editor as unknown as TableHost, sel);
    if (!table) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.shiftKey ? tabBackward(table, cell.row, cell.col) : tabForward(table, cell.row, cell.col);
      if (target) {
        this._focusCell(sel.head.block, target.row, target.col);
      } else if (!e.shiftKey) {
        this.editor.applyOp((doc: any, s: ModelSel) => insertRow(doc, s, 'after'));
        this._focusCell(sel.head.block, cell.row + 1, 0);
      }
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const tableRow = (table.content as BlockNodeData[])[cell.row];
      const cellNode = (tableRow.content as BlockNodeData[])[cell.col];
      const cellBlock = cellNode.content as BlockNodeData[];
      const atFirstPara = cell.para === 0;
      const atLastPara = cell.para === cellBlock.length - 1;
      if ((e.key === 'ArrowUp' && atFirstPara) || (e.key === 'ArrowDown' && atLastPara)) {
        const target = verticalMove(table, cell.row, cell.col, e.key === 'ArrowUp' ? -1 : 1);
        if (target) {
          e.preventDefault();
          this._focusCell(sel.head.block, target.row, target.col);
        }
      }
    }
  }

  private _focusCell(tableBlock: number, row: number, col: number): void {
    const editable = this.editor.getEditable();
    if (!editable) return;
    const pos: ModelPos = { block: tableBlock, offset: 0, cell: { row, col, para: 0 } };
    writeSelection(editable, { anchor: pos, head: pos });
  }

  // ---- column resize (drag the right edge of a header/body cell) ----

  private _installResize(): void {
    const editable = this.editor.getEditable();
    if (!editable) return;
    const EDGE = 6;

    editable.addEventListener('mousemove', (e: MouseEvent) => {
      if (this._resizeState) return;
      const cellEl = (e.target as HTMLElement).closest?.('td,th') as HTMLElement | null;
      if (!cellEl) { editable.style.cursor = ''; return; }
      const rect = cellEl.getBoundingClientRect();
      editable.style.cursor = rect.right - e.clientX <= EDGE ? 'col-resize' : '';
    });

    editable.addEventListener('mousedown', (e: MouseEvent) => {
      const cellEl = (e.target as HTMLElement).closest?.('td,th') as HTMLElement | null;
      if (!cellEl) return;
      const rect = cellEl.getBoundingClientRect();
      if (rect.right - e.clientX > EDGE) return;
      const tableEl = cellEl.closest('table') as HTMLTableElement | null;
      const trEl = cellEl.closest('tr');
      if (!tableEl || !trEl) return;
      e.preventDefault();
      const col = Array.from(trEl.children).indexOf(cellEl);
      const tableRect = tableEl.getBoundingClientRect();
      this._resizeState = { table: tableEl, col, startX: e.clientX, startWidth: rect.width, tableWidth: tableRect.width || 1, liveWidth: null };
      document.addEventListener('mousemove', this._onDocMove);
      document.addEventListener('mouseup', this._onDocUp);
    });
  }

  private _handleResizeMove(e: MouseEvent): void {
    const st = this._resizeState;
    if (!st) return;
    const deltaPct = ((e.clientX - st.startX) / st.tableWidth) * 100;
    const widthPct = Math.max(5, Math.round((st.startWidth / st.tableWidth) * 100 + deltaPct));
    st.liveWidth = widthPct;
    for (const trEl of Array.from(st.table.querySelectorAll('tr'))) {
      const c = trEl.children[st.col] as HTMLElement | undefined;
      if (c) c.style.width = `${widthPct}%`;
    }
  }

  private _commitResize(): void {
    const st = this._resizeState;
    this._resizeState = null;
    document.removeEventListener('mousemove', this._onDocMove);
    document.removeEventListener('mouseup', this._onDocUp);
    if (!st || st.liveWidth == null) return;
    const editable = this.editor.getEditable();
    if (!editable) return;
    const tableBlock = topLevelBlockIndexOf(editable, st.table);
    if (tableBlock < 0) return;
    const newDoc = setColumnWidth(this.editor.getDoc(), tableBlock, st.col, st.liveWidth);
    this.editor.dispatch({ doc: newDoc, sel: this.editor.getSelectionModel() });
  }
}
