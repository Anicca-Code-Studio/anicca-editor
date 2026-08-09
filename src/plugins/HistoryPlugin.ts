import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { icons } from '../ui/icons.js';

class UndoCommand extends Command {
  execute(): void { this.editor.undo(); }
  refresh(): void { this.isEnabled = this.editor.history.canUndo(); }
}

class RedoCommand extends Command {
  execute(): void { this.editor.redo(); }
  refresh(): void { this.isEnabled = this.editor.history.canRedo(); }
}

export class HistoryPlugin extends Plugin {
  static readonly pluginName = 'History';

  init(): void {
    this.editor.registerCommand('undo', new UndoCommand(this.editor));
    this.editor.registerCommand('redo', new RedoCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'undo', label: 'Undo', icon: icons.undo, command: 'undo', tooltip: 'Undo (Ctrl+Z)', group: 'history' });
    this.editor.registerToolbarItem({ name: 'redo', label: 'Redo', icon: icons.redo, command: 'redo', tooltip: 'Redo (Ctrl+Y)', group: 'history' });

    this.editor.on('keydown', (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        this.editor.execute('undo');
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        this.editor.execute('redo');
      }
    });
  }
}
