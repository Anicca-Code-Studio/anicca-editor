import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { toggleMark, rangeHasMark } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class UnderlineCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => toggleMark(doc, sel, 'underline'));
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'underline');
  }
}

export class UnderlinePlugin extends Plugin {
  static readonly pluginName = 'Underline';

  init(): void {
    this.editor.registerCommand('underline', new UnderlineCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'underline', label: 'U', icon: icons.underline, command: 'underline', tooltip: 'Underline (Ctrl+U)', group: 'format' });
    this.editor.on('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { e.preventDefault(); this.editor.execute('underline'); }
    });
  }
}
