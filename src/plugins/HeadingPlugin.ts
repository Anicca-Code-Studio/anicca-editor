import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { setBlockType, blockAt } from '../core/Transaction.js';

class HeadingCommand extends Command {
  execute(attrs?: Record<string, any>): void {
    const value = attrs?.value ?? attrs?.level ?? 2;
    if (value === 'p' || value === 'paragraph') {
      this.editor.applyOp((doc, sel) => setBlockType(doc, sel, 'paragraph'));
    } else {
      const level = Number(value);
      this.editor.applyOp((doc, sel) => setBlockType(doc, sel, 'heading', { level }));
    }
  }

  refresh(): void {
    this.isEnabled = true;
    const b = blockAt(this.editor.getDoc(), this.editor.getSelectionModel());
    this.value = b.type === 'heading';
  }
}

export class HeadingPlugin extends Plugin {
  static readonly pluginName = 'Heading';

  init(): void {
    this.editor.registerCommand('heading', new HeadingCommand(this.editor));
    this.editor.registerToolbarItem({
      name: 'heading',
      label: 'Style',
      command: 'heading',
      tooltip: 'Paragraph style',
      type: 'select',
      group: 'paragraph',
      options: [
        { label: 'Normal text', value: 'p' },
        { label: 'Heading 1', value: 1 },
        { label: 'Heading 2', value: 2 },
        { label: 'Heading 3', value: 3 },
        { label: 'Heading 4', value: 4 },
      ],
    });
  }
}
