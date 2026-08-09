import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { toggleMark, rangeHasMark } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class SubscriptCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => {
      const adding = !rangeHasMark(doc, sel, 'subscript');
      let res = toggleMark(doc, sel, 'subscript');
      if (adding && rangeHasMark(res.doc, sel, 'superscript')) res = toggleMark(res.doc, sel, 'superscript');
      return res;
    });
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'subscript');
  }
}

export class SubscriptPlugin extends Plugin {
  static readonly pluginName = 'Subscript';

  init(): void {
    this.editor.registerCommand('subscript', new SubscriptCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'subscript', label: 'x2', icon: icons.subscript, command: 'subscript', tooltip: 'Subscript', group: 'format' });
  }
}
