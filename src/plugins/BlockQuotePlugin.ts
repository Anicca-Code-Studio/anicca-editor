import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { setBlockType, blockAt } from '../core/Transaction.js';
import { icons } from '../ui/icons.js';

class BlockQuoteCommand extends Command {
  execute(): void {
    this.editor.applyOp((doc, sel) => {
      const isQuote = blockAt(doc, sel).type === 'blockquote';
      return setBlockType(doc, sel, isQuote ? 'paragraph' : 'blockquote');
    });
  }
  refresh(): void {
    this.isEnabled = true;
    this.value = blockAt(this.editor.getDoc(), this.editor.getSelectionModel()).type === 'blockquote';
  }
}

export class BlockQuotePlugin extends Plugin {
  static readonly pluginName = 'BlockQuote';

  init(): void {
    this.editor.registerCommand('blockquote', new BlockQuoteCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'blockquote', label: 'Quote', icon: icons.quote, command: 'blockquote', tooltip: 'Blockquote', group: 'paragraph' });
  }
}
