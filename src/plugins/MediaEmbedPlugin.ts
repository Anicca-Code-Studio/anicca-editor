import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { insertEmbed } from '../core/Transaction.js';
import { sanitizeEmbedSrc } from '../core/sanitize.js';
import { icons } from '../ui/icons.js';

class EmbedCommand extends Command {
  execute(attrs?: Record<string, any>): void {
    let url: string = attrs?.src ?? '';
    if (!url && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      url = window.prompt('Video URL (YouTube or Vimeo)') ?? '';
    }
    const src = sanitizeEmbedSrc(url);
    if (!src) return;
    this.editor.applyOp((doc, sel) => insertEmbed(doc, sel, { src }));
  }
}

export class MediaEmbedPlugin extends Plugin {
  static readonly pluginName = 'MediaEmbed';

  init(): void {
    this.editor.registerCommand('embed', new EmbedCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'embed', label: 'Video', icon: icons.video, command: 'embed', tooltip: 'Embed video (YouTube/Vimeo)', group: 'insert' });
  }
}
