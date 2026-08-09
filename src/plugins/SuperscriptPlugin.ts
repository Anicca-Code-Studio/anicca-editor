import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { toggleMark, rangeHasMark } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class SuperscriptCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => {
      const adding = !rangeHasMark(doc, sel, 'superscript');
      let res = toggleMark(doc, sel, 'superscript');
      // Superscript and subscript are mutually exclusive on the same text.
      if (adding && rangeHasMark(res.doc, sel, 'subscript')) res = toggleMark(res.doc, sel, 'subscript');
      return res;
    });
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'superscript');
  }
}

export class SuperscriptPlugin extends Plugin {
  static readonly pluginName = 'Superscript';

  init(): void {
    this.editor.registerCommand('superscript', new SuperscriptCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'superscript', label: 'x2', icon: icons.superscript, command: 'superscript', tooltip: 'Superscript', group: 'format' });
  }
}
