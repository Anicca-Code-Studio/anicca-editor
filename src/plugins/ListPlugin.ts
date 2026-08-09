import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { setBlockType, blockAt, indentListItem, outdentListItem } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

function isList(editor: any, kind: string): boolean {
  const b = blockAt(editor.getDoc(), editor.getSelectionModel());
  return b.type === 'list_item' && (b.attrs?.kind ?? 'bullet') === kind;
}

class BulletListCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => {
      const b = blockAt(doc, sel);
      const active = b.type === 'list_item' && (b.attrs?.kind ?? 'bullet') === 'bullet';
      return setBlockType(doc, sel, active ? 'paragraph' : 'list_item', active ? undefined : { kind: 'bullet' });
    });
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = isList(this.editor, 'bullet');
  }
}

class OrderedListCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => {
      const b = blockAt(doc, sel);
      const active = b.type === 'list_item' && (b.attrs?.kind ?? 'bullet') === 'ordered';
      return setBlockType(doc, sel, active ? 'paragraph' : 'list_item', active ? undefined : { kind: 'ordered' });
    });
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = isList(this.editor, 'ordered');
  }
}

class IndentCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => indentListItem(doc, sel));
  }
  refresh(): void {
    this.isEnabled = blockAt(this.editor.getDoc(), this.editor.getSelectionModel()).type === 'list_item';
  }
}

class OutdentCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => outdentListItem(doc, sel));
  }
  refresh(): void {
    this.isEnabled = blockAt(this.editor.getDoc(), this.editor.getSelectionModel()).type === 'list_item';
  }
}

export class ListPlugin extends Plugin {
  static readonly pluginName = 'List';

  init(): void {
    this.editor.registerCommand('bulletList', new BulletListCommand(this.editor));
    this.editor.registerCommand('orderedList', new OrderedListCommand(this.editor));
    this.editor.registerCommand('indentList', new IndentCommand(this.editor));
    this.editor.registerCommand('outdentList', new OutdentCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'bulletList', label: 'Bullet list', icon: icons.bulletList, command: 'bulletList', tooltip: 'Bullet list', group: 'list' });
    this.editor.registerToolbarItem({ name: 'orderedList', label: 'Numbered list', icon: icons.orderedList, command: 'orderedList', tooltip: 'Numbered list', group: 'list' });
    this.editor.registerToolbarItem({ name: 'outdentList', label: 'Decrease indent', icon: icons.outdent, command: 'outdentList', tooltip: 'Decrease indent (Shift+Tab)', group: 'list' });
    this.editor.registerToolbarItem({ name: 'indentList', label: 'Increase indent', icon: icons.indent, command: 'indentList', tooltip: 'Increase indent (Tab)', group: 'list' });

    // Tab / Shift+Tab indents the current list item. Only intercepted inside a
    // list so Tab keeps its normal behaviour elsewhere.
    this.editor.on('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (blockAt(this.editor.getDoc(), this.editor.getSelectionModel()).type !== 'list_item') return;
      e.preventDefault();
      this.editor.applyOp((doc, sel) => (e.shiftKey ? outdentListItem(doc, sel) : indentListItem(doc, sel)));
    });
  }
}
