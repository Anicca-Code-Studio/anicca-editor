import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { setMark, removeMark } from '../core/Transaction.js';

class FontSizeCommand extends Command {
  execute(attrs?: Record<string, any>): void {
    const size: string = attrs?.value ?? attrs?.size ?? '';
    this.editor.applyOp((doc, sel) =>
      size && size !== 'none' ? setMark(doc, sel, 'fontSize', { size }) : removeMark(doc, sel, 'fontSize'),
    );
  }
}

export class FontSizePlugin extends Plugin {
  static readonly pluginName = 'FontSize';

  init(): void {
    this.editor.registerCommand('fontSize', new FontSizeCommand(this.editor));
    this.editor.registerToolbarItem({
      name: 'fontSize', label: 'Size', command: 'fontSize', tooltip: 'Font size',
      type: 'select', group: 'font',
      options: [
        { label: 'Default', value: 'none' },
        { label: 'Small', value: '13px' },
        { label: 'Normal', value: '16px' },
        { label: 'Large', value: '20px' },
        { label: 'Huge', value: '28px' },
      ],
    });
  }
}
