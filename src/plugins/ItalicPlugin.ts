import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { toggleMark, rangeHasMark } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class ItalicCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => toggleMark(doc, sel, 'italic'));
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'italic');
  }
}

export class ItalicPlugin extends Plugin {
  static readonly pluginName = 'Italic';

  init(): void {
    this.editor.registerCommand('italic', new ItalicCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'italic', label: 'I', icon: icons.italic, command: 'italic', tooltip: 'Italic (Ctrl+I)', group: 'format' });
    this.editor.on('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); this.editor.execute('italic'); }
    });
  }
}
