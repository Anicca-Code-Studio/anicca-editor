import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { setBlockAttr, blockAt } from '../core/Transaction.js';

class AlignCommand extends Command {
  execute(attrs?: Record<string, any>): void {
    const align: string = attrs?.value ?? attrs?.align ?? 'left';
    this.editor.applyOp((doc, sel) => setBlockAttr(doc, sel, 'align', align));
  }
  refresh(): void {
    this.isEnabled = true;
  }
}

export class AlignPlugin extends Plugin {
  static readonly pluginName = 'Align';

  init(): void {
    this.editor.registerCommand('align', new AlignCommand(this.editor));
    this.editor.registerToolbarItem({
      name: 'align', label: 'Align', command: 'align', tooltip: 'Text alignment',
      type: 'select', group: 'align',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
        { label: 'Right', value: 'right' },
        { label: 'Justify', value: 'justify' },
      ],
    });
  }
}
