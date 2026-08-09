import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { setMark, removeMark } from '../core/Transaction.js';

class FontFamilyCommand extends Command {
  execute(attrs?: Record<string, any>): void {
    const font: string = attrs?.value ?? attrs?.font ?? '';
    this.editor.applyOp((doc, sel) =>
      font && font !== 'none' ? setMark(doc, sel, 'fontFamily', { font }) : removeMark(doc, sel, 'fontFamily'),
    );
  }
}

export class FontFamilyPlugin extends Plugin {
  static readonly pluginName = 'FontFamily';

  init(): void {
    this.editor.registerCommand('fontFamily', new FontFamilyCommand(this.editor));
    this.editor.registerToolbarItem({
      name: 'fontFamily', label: 'Font', command: 'fontFamily', tooltip: 'Font', group: 'font',
      type: 'select',
      options: [
        { label: 'Default', value: 'none' },
        { label: 'Arial', value: 'Arial' },
        { label: 'Georgia', value: 'Georgia' },
        { label: 'Times New Roman', value: 'Times New Roman' },
        { label: 'Courier New', value: 'Courier New' },
        { label: 'Verdana', value: 'Verdana' },
      ],
    });
  }
}
