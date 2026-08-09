import type { Editor } from '../core/Editor.js';

export abstract class Plugin {
  static readonly pluginName: string = '';

  constructor(protected editor: Editor) {}

  abstract init(): void;

  destroy(): void {}
}
