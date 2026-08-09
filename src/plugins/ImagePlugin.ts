import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { insertImage, updateImage } from '../core/Transaction.js';
import { topLevelBlockIndexOf } from '../core/Position.js';
import { icons } from '../ui/icons.js';

class ImageCommand extends Command {
  execute(attrs?: Record<string, any>): void {
    let src: string = attrs?.src ?? '';
    // No src supplied (e.g. the toolbar button): ask for a URL when we can.
    if (!src && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      src = window.prompt('Image URL') ?? '';
    }
    if (!src) return;
    const alt = attrs?.alt ?? '';
    this.editor.applyOp((doc, sel) => insertImage(doc, sel, { src, alt }));
  }
}

// Align / caption act on the figure the user last selected (clicked). They are
// enabled only while a figure is selected.
class ImageAlignCommand extends Command {
  constructor(editor: any, private plugin: ImagePlugin) { super(editor); }
  execute(attrs?: Record<string, any>): void {
    const i = this.plugin.selectedIndex;
    if (i < 0) return;
    const align = attrs?.value ?? attrs?.align ?? '';
    this.editor.applyOp((doc) => updateImage(doc, i, { align: align === 'left' ? '' : align }));
  }
  refresh(): void { this.isEnabled = this.plugin.selectedIndex >= 0; }
}

class ImageCaptionCommand extends Command {
  constructor(editor: any, private plugin: ImagePlugin) { super(editor); }
  execute(attrs?: Record<string, any>): void {
    const i = this.plugin.selectedIndex;
    if (i < 0) return;
    let caption: string | undefined = attrs?.caption;
    if (caption == null && typeof window !== 'undefined' && typeof window.prompt === 'function') {
      caption = window.prompt('Caption') ?? '';
    }
    this.editor.applyOp((doc) => updateImage(doc, i, { caption: caption ?? '' }));
  }
  refresh(): void { this.isEnabled = this.plugin.selectedIndex >= 0; }
}

export class ImagePlugin extends Plugin {
  static readonly pluginName = 'Image';

  /** doc.content index of the figure the user last selected, or -1. */
  selectedIndex = -1;
  private _pendingWidth: number | null = null;

  init(): void {
    this.editor.registerCommand('image', new ImageCommand(this.editor));
    this.editor.registerCommand('imageAlign', new ImageAlignCommand(this.editor, this));
    this.editor.registerCommand('imageCaption', new ImageCaptionCommand(this.editor, this));
    this.editor.registerToolbarItem({ name: 'image', label: 'Image', icon: icons.image, command: 'image', tooltip: 'Insert image', group: 'insert' });
    this.editor.registerToolbarItem({
      name: 'imageAlign', label: 'Image align', command: 'imageAlign', tooltip: 'Align selected image',
      type: 'select', group: 'insert',
      options: [
        { label: 'Image left', value: 'left' },
        { label: 'Image center', value: 'center' },
        { label: 'Image right', value: 'right' },
      ],
    });
    this.editor.registerToolbarItem({ name: 'imageCaption', label: 'Caption', icon: icons.caption, command: 'imageCaption', tooltip: 'Edit image caption', group: 'insert' });

    // The editable mounts after init; wire DOM listeners on 'ready'.
    this.editor.on('ready', () => this._attach());
  }

  private _attach(): void {
    const ed = this.editor.getEditable();
    if (!ed) return;
    ed.addEventListener('click', (e) => this._onClick(e as MouseEvent));
    // A re-render (any edit) drops the transient handle; clear our reference.
    this.editor.on('change', () => { this.selectedIndex = -1; });
  }

  private _onClick(e: MouseEvent): void {
    const ed = this.editor.getEditable();
    if (!ed) return;
    this._clearHandle(ed);
    const fig = (e.target as HTMLElement).closest('figure');
    if (!fig || !ed.contains(fig)) { this.selectedIndex = -1; return; }
    this.selectedIndex = topLevelBlockIndexOf(ed, fig);
    this._addHandle(ed, fig as HTMLElement);
  }

  private _clearHandle(ed: HTMLElement): void {
    ed.querySelectorAll('.anicca-resize-handle').forEach(h => h.remove());
  }

  private _addHandle(ed: HTMLElement, fig: HTMLElement): void {
    const img = fig.querySelector('img');
    if (!img) return;
    if (getComputedStyle(fig).position === 'static') fig.style.position = 'relative';
    const handle = ed.ownerDocument.createElement('span');
    handle.className = 'anicca-resize-handle';
    handle.setAttribute('contenteditable', 'false');
    handle.style.cssText = 'position:absolute;right:0;bottom:0;width:12px;height:12px;background:#2563eb;border:2px solid #fff;border-radius:2px;cursor:nwse-resize;';
    handle.addEventListener('mousedown', (ev) => this._startResize(ev as MouseEvent, ed, fig, img));
    fig.appendChild(handle);
  }

  private _startResize(e: MouseEvent, ed: HTMLElement, fig: HTMLElement, img: HTMLImageElement): void {
    e.preventDefault();
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width || img.width || 100;
    const edWidth = ed.getBoundingClientRect().width || fig.getBoundingClientRect().width || 1;
    const idx = this.selectedIndex;

    const onMove = (me: MouseEvent) => {
      const newPx = Math.max(20, startW + (me.clientX - startX));
      const pct = Math.max(5, Math.min(100, Math.round((newPx / edWidth) * 100)));
      img.style.width = pct + '%';
      this._pendingWidth = pct;
    };
    const onUp = () => {
      ed.ownerDocument.removeEventListener('mousemove', onMove);
      ed.ownerDocument.removeEventListener('mouseup', onUp);
      if (this._pendingWidth != null && idx >= 0) {
        const w = this._pendingWidth;
        this.editor.applyOp((doc) => updateImage(doc, idx, { width: w }));
      }
      this._pendingWidth = null;
    };
    ed.ownerDocument.addEventListener('mousemove', onMove);
    ed.ownerDocument.addEventListener('mouseup', onUp);
  }
}
