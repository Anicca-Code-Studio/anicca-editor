import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { toggleMark, rangeHasMark } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class CodeCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => toggleMark(doc, sel, 'code'));
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'code');
  }
}

export class CodePlugin extends Plugin {
  static readonly pluginName = 'Code';

  init(): void {
    this.editor.registerCommand('code', new CodeCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'code', label: 'Code', icon: icons.code, command: 'code', tooltip: 'Inline Code', group: 'format' });
  }
}
