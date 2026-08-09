import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { setMark, removeMark } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

// A color mark plugin shared by text color and background color: both are
// "set" (replace) marks. The toolbar wires a native color picker; a value of
// 'none' (right click to clear) removes the mark.
class ColorCommand extends Command {
  constructor(editor: any, private markType: string) { super(editor); }
  execute(attrs?: Record<string, any>): void {
    const color: string = attrs?.value ?? attrs?.color ?? '';
    this.editor.applyOp((doc: any, sel: any) =>
      color && color !== 'none' ? setMark(doc, sel, this.markType, { color }) : removeMark(doc, sel, this.markType),
    );
  }
}

export class TextColorPlugin extends Plugin {
  static readonly pluginName = 'TextColor';

  init(): void {
    this.editor.registerCommand('textColor', new ColorCommand(this.editor, 'textColor'));
    this.editor.registerToolbarItem({
      name: 'textColor', label: 'A', icon: icons.textColor, command: 'textColor',
      tooltip: 'Text color (right click to clear)', type: 'color', group: 'color',
    });
  }
}

export class BackgroundColorPlugin extends Plugin {
  static readonly pluginName = 'BackgroundColor';

  init(): void {
    this.editor.registerCommand('backgroundColor', new ColorCommand(this.editor, 'backgroundColor'));
    this.editor.registerToolbarItem({
      name: 'backgroundColor', label: 'Highlight', icon: icons.highlight, command: 'backgroundColor',
      tooltip: 'Highlight color (right click to clear)', type: 'color', group: 'color',
    });
  }
}
