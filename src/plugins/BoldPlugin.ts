import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { toggleMark, rangeHasMark } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class BoldCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => toggleMark(doc, sel, 'bold'));
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'bold');
  }
}

export class BoldPlugin extends Plugin {
  static readonly pluginName = 'Bold';

  init(): void {
    this.editor.registerCommand('bold', new BoldCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'bold', label: 'B', icon: icons.bold, command: 'bold', tooltip: 'Bold (Ctrl+B)', group: 'format' });
    this.editor.on('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); this.editor.execute('bold'); }
    });
  }
}
