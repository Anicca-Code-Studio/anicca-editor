import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { toggleMark, rangeHasMark } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class StrikethroughCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => toggleMark(doc, sel, 'strikethrough'));
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'strikethrough');
  }
}

export class StrikethroughPlugin extends Plugin {
  static readonly pluginName = 'Strikethrough';

  init(): void {
    this.editor.registerCommand('strikethrough', new StrikethroughCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'strikethrough', label: 'S', icon: icons.strikethrough, command: 'strikethrough', tooltip: 'Strikethrough', group: 'format' });
  }
}
