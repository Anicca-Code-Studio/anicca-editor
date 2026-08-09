import type { Editor } from './Editor.js';

export abstract class Command {
  isEnabled: boolean = true;
  value: boolean = false;

  constructor(protected editor: Editor) {}

  abstract execute(attrs?: Record<string, any>): void;

  refresh(): void {
    this.isEnabled = true;
  }
}
