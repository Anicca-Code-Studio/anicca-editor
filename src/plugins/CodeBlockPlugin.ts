import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { setBlockType, blockAt } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class CodeBlockCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => {
      const isCode = blockAt(doc, sel).type === 'code_block';
      return setBlockType(doc, sel, isCode ? 'paragraph' : 'code_block', isCode ? undefined : { language: '' });
    });
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = blockAt(this.editor.getDoc(), this.editor.getSelectionModel()).type === 'code_block';
  }
}

export class CodeBlockPlugin extends Plugin {
  static readonly pluginName = 'CodeBlock';

  init(): void {
    this.editor.registerCommand('codeBlock', new CodeBlockCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'codeBlock', label: 'Code Block', icon: icons.codeBlock, command: 'codeBlock', tooltip: 'Code Block', group: 'paragraph' });
  }
}
