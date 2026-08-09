import { EventEmitter } from './EventEmitter.js';
import { Schema, defaultSchema } from './Schema.js';
import { DocData, cloneDoc, emptyDoc } from './Model.js';
import { History } from './History.js';
import { Command } from './Command.js';
import { serialize } from '../conversion/Serializer.js';
import { parse } from '../conversion/Parser.js';
import { render } from './Renderer.js';
import { diffDoc } from './patch.js';
import { applyChange } from './collab.js';
import type { Change } from './collab.js';
import type { ModelSel } from './Position.js';
import { collapsed, readSelection, writeSelection, leafBlockElementAt } from './Position.js';
import { parseInlineContent } from '../conversion/Parser.js';
import type { TxResult } from './Transaction.js';
import {
  insertText as insertTextOp,
  splitBlock as splitBlockOp,
  deleteBackward as deleteBackwardOp,
  deleteForward as deleteForwardOp,
  replaceBlockInlines,
  sliceSelection,
  insertFragment,
  insertImage,
  deleteRange as deleteRangeOp,
} from './Transaction.js';
import { selCollapsed } from './Position.js';
import { pasteToFragment, textToFragment, fragmentText } from './clipboard.js';

/** A plugin-supplied beforeinput interceptor. Return true to consume the event. */
export type InputHandler = (e: InputEvent, editor: Editor) => boolean;
import type { Plugin } from '../plugins/Plugin.js';

export interface ToolbarItemConfig {
  name: string;
  label: string;
  command: string;
  commandAttrs?: Record<string, any>;
  tooltip?: string;
  type?: 'button' | 'select' | 'color';
  options?: Array<{ label: string; value: any }>;
  /** Inline SVG markup (from the editor's own icon set) shown instead of label. */
  icon?: string;
  /** Items sharing a group sit together; a separator is drawn between groups. */
  group?: string;
}

export interface EditorConfig {
  attachTo: HTMLElement;
  plugins?: Array<new (editor: Editor) => Plugin>;
  data?: string;
  schema?: Schema;
  placeholder?: string;
  /**
   * Optional upload hook. When set, pasted/dropped image files are handed to
   * it and the resolved URL is stored in the model. Without it, image files
   * fall back to an inline base64 data URI.
   */
  upload?: (file: File) => Promise<string>;
  /** Max undo depth before the oldest step is dropped (default 1000). */
  historyLimit?: number;
  /**
   * Color theme. 'light' (default) or 'dark' pin the palette; 'auto' follows the
   * operating system preference. Switch at runtime with `setTheme`.
   */
  theme?: 'light' | 'dark' | 'auto';
  /**
   * Per-instance color overrides, keyed by token name in camelCase, e.g.
   * `{ accent: '#e11d48', accentBg: '#fde4ea' }`. Recognized tokens: bg,
   * toolbarBg, text, muted, icon, border, hover, accent, accentBg, codeBg,
   * thBg, placeholder. Update at runtime with `setThemeColors`.
   */
  themeColors?: Record<string, string>;
}

/** A Model operation: given the current doc + selection, return the next state. */
export type ModelOp = (doc: DocData, sel: ModelSel) => TxResult;

export class Editor extends EventEmitter {
  schema: Schema;
  history: History;

  private _doc: DocData;
  private _commands: Map<string, Command> = new Map();
  private _toolbarItems: ToolbarItemConfig[] = [];
  private _plugins: Plugin[] = [];
  private _container: HTMLElement;
  private _toolbar: HTMLElement | null = null;
  private _editable: HTMLElement | null = null;
  private _placeholder: string;
  private _composing = false;
  private _inputHandlers: InputHandler[] = [];
  private _upload?: (file: File) => Promise<string>;
  private _version = 0;
  private _theme: 'light' | 'dark' | 'auto' = 'light';
  private _themeColors?: Record<string, string>;

  constructor(config: EditorConfig) {
    super();
    this._container = config.attachTo;
    this.schema = config.schema ?? defaultSchema;
    this._placeholder = config.placeholder ?? 'Type something...';
    this._upload = config.upload;
    this._theme = config.theme ?? 'light';
    this._themeColors = config.themeColors;
    this._doc = this.schema.normalize(config.data ? parse(config.data) : emptyDoc());
    this.history = new History(config.historyLimit);

    for (const PluginClass of config.plugins ?? []) {
      const p = new PluginClass(this);
      this._plugins.push(p);
      p.init();
    }

    this._mount();
    this._renderView();
    // The editable exists only after _mount; plugins that need DOM access
    // (e.g. image resize handles) subscribe to 'ready' during init and wire up
    // here, once the view is live.
    this.emit('ready', this);
  }

  private _mount(): void {
    injectStyles(this._container.ownerDocument);
    this._container.classList.add('anicca-editor');
    this._container.classList.add(`anicca-theme-${this._theme}`);
    if (this._themeColors) this.setThemeColors(this._themeColors);

    this._toolbar = document.createElement('div');
    this._toolbar.className = 'anicca-toolbar';
    this._toolbar.setAttribute('role', 'toolbar');
    this._toolbar.setAttribute('aria-label', 'Text formatting');
    this._toolbar.addEventListener('keydown', (e) => this._onToolbarKeydown(e as KeyboardEvent));

    this._editable = document.createElement('div');
    this._editable.className = 'anicca-editable';
    this._editable.contentEditable = 'true';
    this._editable.setAttribute('role', 'textbox');
    this._editable.setAttribute('aria-multiline', 'true');
    this._editable.setAttribute('aria-label', this._placeholder);
    this._editable.setAttribute('data-placeholder', this._placeholder);

    this._container.appendChild(this._toolbar);
    this._container.appendChild(this._editable);

    this._installInputHandler(this._editable);

    this._editable.addEventListener('keydown', (e: KeyboardEvent) => {
      this.emit('keydown', e);
    });

    this._editable.addEventListener('copy', (e) => this._onCopy(e as ClipboardEvent));
    this._editable.addEventListener('cut', (e) => this._onCut(e as ClipboardEvent));
    this._editable.addEventListener('paste', (e) => this._onPaste(e as ClipboardEvent));
    this._editable.addEventListener('drop', (e) => this._onDrop(e as DragEvent));
    this._editable.addEventListener('dragover', (e) => { if ((e as DragEvent).dataTransfer?.types.includes('Files')) e.preventDefault(); });

    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (!sel || !this._editable) return;
      if (sel.anchorNode && this._editable.contains(sel.anchorNode)) {
        this.history.breakCoalescing();
        this._onSelectionChange();
      }
    });

    this._renderToolbar();
  }

  // ---- input pipeline (Model-driven, no execCommand) ----

  private _installInputHandler(el: HTMLElement): void {
    el.addEventListener('compositionstart', () => { this._composing = true; });
    el.addEventListener('compositionend', () => {
      this._composing = false;
      // The IME has written into one block; reparse only that block so the
      // model stays the source of truth (marks/attrs of other blocks intact).
      this._resyncBlockFromDOM();
      this._refreshCommands();
      this.emit('change', this);
    });

    el.addEventListener('beforeinput', (e: InputEvent) => {
      if (this._composing) return; // let the IME drive; resync on compositionend
      // Plugins (e.g. input rules) get first refusal on the event.
      for (const handler of this._inputHandlers) {
        if (handler(e, this)) { e.preventDefault(); return; }
      }
      const handled = this._handleBeforeInput(e);
      if (handled) e.preventDefault();
    });

    // Any input we did NOT preventDefault (native/unhandled edit) lands here.
    // Resync just the block the caret sits in rather than the whole document.
    el.addEventListener('input', () => {
      if (this._composing) return;
      this._resyncBlockFromDOM();
      this._refreshCommands();
      this.emit('change', this);
    });
  }

  /** Register a plugin beforeinput interceptor (used by input rules). */
  registerInputHandler(handler: InputHandler): void {
    this._inputHandlers.push(handler);
  }

  private _handleBeforeInput(e: InputEvent): boolean {
    const t = e.inputType;
    switch (t) {
      case 'insertText':
        if (e.data == null) return false;
        this.applyOp((d, s) => insertTextOp(d, s, e.data as string), { coalesce: true });
        return true;
      case 'insertParagraph':
        this.applyOp(splitBlockOp);
        return true;
      case 'insertLineBreak':
        this.applyOp(splitBlockOp);
        return true;
      case 'deleteContentBackward':
        this.applyOp(deleteBackwardOp);
        return true;
      case 'deleteContentForward':
        this.applyOp(deleteForwardOp);
        return true;
      default:
        return false; // fall through to native + resync via 'input'
    }
  }

  private _onSelectionChange(): void {
    this._refreshCommands();
    this.emit('selectionChange', this);
  }

  // ---- clipboard (Model-driven copy / cut / paste) ----

  private _writeClipboard(e: ClipboardEvent, sel: ModelSel): void {
    const frag = sliceSelection(this._doc, sel);
    if (frag.content.length === 0) return;
    e.clipboardData?.setData('text/html', serialize(frag));
    e.clipboardData?.setData('text/plain', fragmentText(frag));
    e.preventDefault();
  }

  private _onCopy(e: ClipboardEvent): void {
    const sel = this.getSelectionModel();
    if (selCollapsed(sel)) return;
    this._writeClipboard(e, sel);
  }

  private _onCut(e: ClipboardEvent): void {
    const sel = this.getSelectionModel();
    if (selCollapsed(sel)) return;
    this._writeClipboard(e, sel);
    this.applyOp((d, s) => deleteRangeOp(d, s));
  }

  private _onPaste(e: ClipboardEvent): void {
    // Image files on the clipboard take priority over any HTML/text payload.
    const imageFiles = this._imageFilesOf(e.clipboardData?.files);
    if (imageFiles.length) {
      e.preventDefault();
      imageFiles.forEach(f => void this.insertImageFromFile(f));
      return;
    }
    const html = e.clipboardData?.getData('text/html') ?? '';
    const text = e.clipboardData?.getData('text/plain') ?? '';
    let frag;
    if (html.trim()) frag = pasteToFragment(html);
    else if (text) frag = textToFragment(text);
    else return;
    e.preventDefault();
    this.applyOp((d, s) => insertFragment(d, s, frag));
  }

  private _onDrop(e: DragEvent): void {
    const imageFiles = this._imageFilesOf(e.dataTransfer?.files);
    if (!imageFiles.length) return;
    e.preventDefault();
    imageFiles.forEach(f => void this.insertImageFromFile(f));
  }

  private _imageFilesOf(files: FileList | null | undefined): File[] {
    if (!files) return [];
    return Array.from(files).filter(f => f.type.startsWith('image/'));
  }

  /** Insert an image from a File, using the upload hook or a base64 fallback. */
  async insertImageFromFile(file: File): Promise<void> {
    const src = this._upload ? await this._upload(file) : await readFileAsDataUrl(file);
    if (!src) return;
    this.applyOp((d, s) => insertImage(d, s, { src, alt: file.name }));
  }

  /** Read the current selection in Model coordinates. */
  getSelectionModel(): ModelSel {
    if (!this._editable) return collapsed(0, 0);
    return readSelection(this._editable) ?? collapsed(0, 0);
  }

  /** Apply a Model operation and reconcile view + selection + history. */
  applyOp(op: ModelOp, opts?: { coalesce?: boolean }): void {
    const sel = this.getSelectionModel();
    const tr = op(this._doc, sel);
    this.dispatch(tr, opts);
  }

  /** Commit a computed transaction result. */
  dispatch(tr: TxResult, opts?: { coalesce?: boolean }): void {
    // Capture the selection *before* the change so undo can restore the caret.
    const selBefore = this.getSelectionModel();
    const before = this._doc;
    // Enforce the schema at the single commit point so every stored doc is valid.
    const after = this.schema.normalize(tr.doc);
    // Record the change as a reversible patch (coalescing typing bursts).
    this.history.push(before, after, selBefore, tr.sel, opts?.coalesce ?? false);
    this._doc = after;
    this._version++;
    this._renderView(tr.sel);
    this._refreshCommands();
    this.emit('change', this);
    // A serializable operation for persistence / transport (collaboration
    // substrate). Consumers stream these; concurrent-merge (OT) is not yet
    // provided — apply remote steps only against a matching base version.
    this.emit('step', { patch: diffDoc(before, after), version: this._version });
  }

  /**
   * Reparse only the block the caret sits in (for IME / unhandled native
   * edits). The DOM block already holds the new text; we lift just its inline
   * content back into the model, keeping every other block untouched and the
   * model as the source of truth. Falls back silently if the block can't be
   * located (e.g. selection outside the editable).
   */
  private _resyncBlockFromDOM(): void {
    if (!this._editable) return;
    const sel = this.getSelectionModel();
    const blockEl = leafBlockElementAt(this._editable, sel.head);
    if (!blockEl) return;
    const inlines = parseInlineContent(blockEl);
    const nextDoc = replaceBlockInlines(this._doc, sel.head, inlines);
    // Commit through dispatch so history records the edit (coalesced, since a
    // composition run is a single logical change) and the view reconciles.
    this.dispatch({ doc: nextDoc, sel }, { coalesce: true });
  }

  private _renderView(sel?: ModelSel): void {
    if (!this._editable) return;
    render(this._editable, this._doc);
    if (sel) {
      try { writeSelection(this._editable, sel); } catch { /* selection may be detached */ }
    }
  }

  private _renderToolbar(): void {
    if (!this._toolbar) return;
    this._toolbar.innerHTML = '';

    let prevGroup: string | undefined;
    let first = true;
    for (const item of this._toolbarItems) {
      // A change of group (after the first item) draws a vertical separator.
      if (!first && item.group !== prevGroup) {
        const sep = document.createElement('span');
        sep.className = 'anicca-sep';
        sep.setAttribute('aria-hidden', 'true');
        this._toolbar.appendChild(sep);
      }
      prevGroup = item.group;
      first = false;

      if (item.type === 'select' && item.options) {
        this._toolbar.appendChild(this._buildSelect(item));
      } else if (item.type === 'color') {
        this._toolbar.appendChild(this._buildColor(item));
      } else {
        this._toolbar.appendChild(this._buildButton(item));
      }
    }

    // Roving tabindex: exactly one stop is focusable at a time.
    const stops = this._toolbar.querySelectorAll<HTMLElement>('[data-toolbar-item]');
    stops.forEach((el, i) => el.tabIndex = i === 0 ? 0 : -1);
  }

  private _buildButton(item: ToolbarItemConfig): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'anicca-btn';
    if (item.icon) btn.innerHTML = item.icon; else btn.textContent = item.label;
    btn.title = item.tooltip ?? item.label;
    btn.dataset.toolbarItem = item.name;
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', item.tooltip ?? item.label);
    btn.setAttribute('aria-pressed', 'false');
    // Use mousedown so the editable keeps its selection when the button is pressed.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.execute(item.command, item.commandAttrs);
    });
    return btn;
  }

  private _buildSelect(item: ToolbarItemConfig): HTMLElement {
    const sel = document.createElement('select');
    sel.className = 'anicca-select';
    sel.title = item.tooltip ?? item.name;
    for (const opt of item.options ?? []) {
      const o = document.createElement('option');
      o.value = String(opt.value);
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      const val = isNaN(Number(sel.value)) ? sel.value : Number(sel.value);
      this.execute(item.command, { ...item.commandAttrs, value: val });
      this._editable?.focus();
    });
    sel.dataset.toolbarItem = item.name;
    sel.tabIndex = -1;
    return sel;
  }

  // A swatch button wrapping a native color input, plus a small clear affordance
  // (right click, or the "A" fallback) that removes the mark via value 'none'.
  private _buildColor(item: ToolbarItemConfig): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'anicca-color';
    wrap.title = item.tooltip ?? item.label;

    const glyph = document.createElement('span');
    glyph.className = 'anicca-color-glyph';
    if (item.icon) glyph.innerHTML = item.icon; else glyph.textContent = item.label;

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'anicca-color-input';
    input.dataset.toolbarItem = item.name;
    input.tabIndex = -1;
    input.setAttribute('aria-label', item.tooltip ?? item.label);
    input.addEventListener('input', () => {
      this.execute(item.command, { ...item.commandAttrs, value: input.value });
      this._editable?.focus();
    });
    // Right click clears the color (back to default).
    wrap.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.execute(item.command, { ...item.commandAttrs, value: 'none' });
      this._editable?.focus();
    });

    wrap.appendChild(glyph);
    wrap.appendChild(input);
    return wrap;
  }

  // Arrow-key navigation across toolbar stops (WAI-ARIA toolbar pattern).
  private _onToolbarKeydown(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (!this._toolbar) return;
    const stops = Array.from(this._toolbar.querySelectorAll<HTMLElement>('[data-toolbar-item]'));
    if (stops.length === 0) return;
    const active = this._toolbar.ownerDocument.activeElement as HTMLElement;
    const idx = Math.max(0, stops.indexOf(active));
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    const next = (idx + dir + stops.length) % stops.length;
    stops.forEach((el, i) => el.tabIndex = i === next ? 0 : -1);
    stops[next].focus();
    e.preventDefault();
  }

  private _refreshCommands(): void {
    this._commands.forEach(cmd => cmd.refresh());
    this._updateToolbarState();
  }

  private _updateToolbarState(): void {
    if (!this._toolbar) return;
    for (const item of this._toolbarItems) {
      const cmd = this._commands.get(item.command);
      if (!cmd) continue;

      const el = this._toolbar.querySelector(`[data-toolbar-item="${item.name}"]`);
      if (!el) continue;

      if (el.tagName === 'BUTTON') {
        const btn = el as HTMLButtonElement;
        btn.disabled = !cmd.isEnabled;
        btn.setAttribute('aria-pressed', cmd.value ? 'true' : 'false');
        btn.classList.toggle('is-active', !!cmd.value);
      }
    }
  }

  registerCommand(name: string, cmd: Command): void {
    this._commands.set(name, cmd);
  }

  registerToolbarItem(config: ToolbarItemConfig): void {
    this._toolbarItems.push(config);
    this._renderToolbar();
  }

  execute(name: string, attrs?: Record<string, any>): void {
    const cmd = this._commands.get(name);
    if (!cmd || !cmd.isEnabled) return;
    cmd.execute(attrs);
  }

  getDoc(): DocData {
    return this._doc;
  }

  setDoc(doc: DocData): void {
    // Replacing the whole document out of band ends any coalescing run so the
    // next typing push can't merge across the reset.
    this.history.breakCoalescing();
    this._doc = this.schema.normalize(cloneDoc(doc));
    this._renderView();
    this._refreshCommands();
  }

  setData(html: string): void {
    this.history.breakCoalescing();
    this._doc = this.schema.normalize(parse(html));
    this._renderView();
    this._refreshCommands();
  }

  getData(): string {
    return serialize(this._doc);
  }

  getEditable(): HTMLElement | null {
    return this._editable;
  }

  /** Look up an initialized plugin instance by its class. */
  getPlugin<T extends Plugin>(ctor: new (editor: Editor) => T): T | null {
    return (this._plugins.find(p => p instanceof ctor) as T) ?? null;
  }

  /**
   * Render an arbitrary (decorated) document without touching the model or
   * history. Used for transient overlays like search highlights; the next real
   * edit re-renders the true model and discards the preview.
   */
  previewDoc(doc: DocData): void {
    if (this._editable) render(this._editable, doc);
  }

  undo(): void {
    const prev = this.history.undo(this._doc);
    if (prev) {
      this._doc = prev.doc;
      this._version++;
      this._renderView(prev.sel);
      this._refreshCommands();
      this.emit('change', this);
    }
  }

  redo(): void {
    const next = this.history.redo(this._doc);
    if (next) {
      this._doc = next.doc;
      this._version++;
      this._renderView(next.sel);
      this._refreshCommands();
      this.emit('change', this);
    }
  }

  /** Monotonic revision counter, bumped on every committed change/undo/redo. */
  getVersion(): number {
    return this._version;
  }

  /** Switch the color theme at runtime ('light' | 'dark' | 'auto'). */
  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this._container.classList.remove('anicca-theme-light', 'anicca-theme-dark', 'anicca-theme-auto');
    this._container.classList.add(`anicca-theme-${theme}`);
    this._theme = theme;
  }

  /** The current theme mode. */
  getTheme(): 'light' | 'dark' | 'auto' {
    return this._theme;
  }

  // Override color tokens on this editor instance. Keys are camelCase token
  // names (accent, accentBg, bg, text, border, ...) mapped to the underlying
  // `--anicca-<kebab>` custom properties, so any color the host wants sticks
  // regardless of the light/dark mode.
  setThemeColors(colors: Record<string, string>): void {
    this._themeColors = { ...(this._themeColors ?? {}), ...colors };
    for (const [key, value] of Object.entries(colors)) {
      const prop = '--anicca-' + key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
      this._container.style.setProperty(prop, value);
    }
  }

  // Apply a remote collaboration change (already rebased onto this document's
  // state via `Collab`/`transform`) without recording it on the local undo
  // stack, since remote edits are not the local user's to undo. Re-renders and
  // bumps the version. The app owns the transport and the `Collab` rebasing; it
  // feeds the ready-to-apply change here.
  applyExternalChange(change: Change): void {
    this._doc = this.schema.normalize(applyChange(this._doc, change));
    this._version++;
    this._renderView(this.getSelectionModel());
    this._refreshCommands();
    this.emit('change', this);
  }

  destroy(): void {
    this._plugins.forEach(p => p.destroy());
    this._container.innerHTML = '';
  }
}

// Inject the default stylesheet once per document. Scoped under `.anicca-editor`
// so it only touches editors this library mounts. Guarded by an id so multiple
// editors on one page share a single style element.
const STYLE_ID = 'anicca-editor-styles';
function injectStyles(doc: Document | null): void {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = EDITOR_CSS;
  (doc.head ?? doc.documentElement).appendChild(el);
}

// Light theme token defaults live on `.anicca-editor`; the dark values are
// applied by the `anicca-theme-dark` class or, for `anicca-theme-auto`, by the
// OS preference. Hosts can override any token per instance (see setThemeColors).
const THEME_LIGHT = `
  --anicca-bg: #ffffff;
  --anicca-toolbar-bg: #ffffff;
  --anicca-text: #202124;
  --anicca-muted: #5f6368;
  --anicca-icon: #444746;
  --anicca-border: #dadce0;
  --anicca-hover: #f1f3f4;
  --anicca-accent: #1a73e8;
  --anicca-accent-bg: #d3e3fd;
  --anicca-code-bg: #f1f3f4;
  --anicca-th-bg: #f8f9fa;
  --anicca-placeholder: #9aa0a6;
  --anicca-shadow: 0 1px 3px rgba(60,64,67,0.12);
`;
const THEME_DARK = `
  --anicca-bg: #1f1f1f;
  --anicca-toolbar-bg: #282a2d;
  --anicca-text: #e8eaed;
  --anicca-muted: #9aa0a6;
  --anicca-icon: #c7c9cc;
  --anicca-border: #3c4043;
  --anicca-hover: #35373b;
  --anicca-accent: #8ab4f8;
  --anicca-accent-bg: #2f4262;
  --anicca-code-bg: #2a2b2e;
  --anicca-th-bg: #2a2b2e;
  --anicca-placeholder: #7a7f85;
  --anicca-shadow: 0 1px 3px rgba(0,0,0,0.4);
`;

const EDITOR_CSS = `
.anicca-editor { ${THEME_LIGHT} }
.anicca-editor.anicca-theme-dark { ${THEME_DARK} }
@media (prefers-color-scheme: dark) {
  .anicca-editor.anicca-theme-auto { ${THEME_DARK} }
}
.anicca-editor {
  border: 1px solid var(--anicca-border);
  border-radius: 8px;
  background: var(--anicca-bg);
  color: var(--anicca-text);
  font-family: "Segoe UI", Roboto, Arial, sans-serif;
  box-shadow: var(--anicca-shadow);
  overflow: hidden;
}
.anicca-editor .anicca-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 5px 8px;
  background: var(--anicca-toolbar-bg);
  border-bottom: 1px solid var(--anicca-border);
}
.anicca-editor .anicca-sep {
  width: 1px;
  height: 22px;
  margin: 0 6px;
  background: var(--anicca-border);
}
.anicca-editor .anicca-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--anicca-icon);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}
.anicca-editor .anicca-btn:hover:not(:disabled) { background: var(--anicca-hover); }
.anicca-editor .anicca-btn:disabled { opacity: 0.38; cursor: default; }
.anicca-editor .anicca-btn.is-active {
  background: var(--anicca-accent-bg);
  color: var(--anicca-accent);
}
.anicca-editor .anicca-btn svg { display: block; }
.anicca-editor .anicca-select {
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--anicca-border);
  border-radius: 4px;
  background: var(--anicca-bg);
  color: var(--anicca-text);
  cursor: pointer;
  font-size: 13px;
}
.anicca-editor .anicca-select:hover { background: var(--anicca-hover); }
.anicca-editor .anicca-color {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 4px;
  color: var(--anicca-icon);
  cursor: pointer;
}
.anicca-editor .anicca-color:hover { background: var(--anicca-hover); }
.anicca-editor .anicca-color-glyph { display: inline-flex; pointer-events: none; }
.anicca-editor .anicca-color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  border: none;
  padding: 0;
}
.anicca-editor .anicca-editable {
  min-height: 220px;
  padding: 28px 40px;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 15px;
  line-height: 1.6;
  color: var(--anicca-text);
}
.anicca-editor .anicca-editable:empty::before,
.anicca-editor .anicca-editable[data-empty]::before { content: attr(data-placeholder); color: var(--anicca-placeholder); }
.anicca-editor .anicca-editable p { margin: 0 0 12px; }
.anicca-editor .anicca-editable h1 { font-size: 1.9em; font-weight: 600; margin: 20px 0 10px; }
.anicca-editor .anicca-editable h2 { font-size: 1.5em; font-weight: 600; margin: 18px 0 8px; }
.anicca-editor .anicca-editable h3 { font-size: 1.25em; font-weight: 600; margin: 16px 0 6px; }
.anicca-editor .anicca-editable h4 { font-size: 1.1em; font-weight: 600; margin: 14px 0 6px; }
.anicca-editor .anicca-editable blockquote {
  margin: 12px 0;
  padding: 4px 16px;
  border-left: 3px solid var(--anicca-border);
  color: var(--anicca-muted);
}
.anicca-editor .anicca-editable pre {
  margin: 12px 0;
  padding: 12px 16px;
  background: var(--anicca-code-bg);
  border-radius: 6px;
  overflow-x: auto;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
}
.anicca-editor .anicca-editable code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 0.9em;
  background: var(--anicca-code-bg);
  padding: 1px 4px;
  border-radius: 3px;
}
.anicca-editor .anicca-editable pre code { background: none; padding: 0; }
/* Explicit list styles so a host CSS reset (e.g. Tailwind Preflight) cannot
   strip the bullets and numbers. The compound selector out-specifies bare
   ul/ol resets. */
.anicca-editor .anicca-editable ul,
.anicca-editor .anicca-editable ol { margin: 8px 0; padding-left: 26px; }
.anicca-editor .anicca-editable ul { list-style: disc outside; }
.anicca-editor .anicca-editable ol { list-style: decimal outside; }
.anicca-editor .anicca-editable ul ul { list-style-type: circle; }
.anicca-editor .anicca-editable ul ul ul { list-style-type: square; }
.anicca-editor .anicca-editable ol ol { list-style-type: lower-alpha; }
.anicca-editor .anicca-editable ol ol ol { list-style-type: lower-roman; }
.anicca-editor .anicca-editable li { display: list-item; margin: 3px 0; }
.anicca-editor .anicca-editable a { color: var(--anicca-accent); text-decoration: none; }
.anicca-editor .anicca-editable a:hover { text-decoration: underline; }
.anicca-editor .anicca-editable table { border-collapse: collapse; width: 100%; margin: 12px 0; }
.anicca-editor .anicca-editable td,
.anicca-editor .anicca-editable th { border: 1px solid var(--anicca-border); padding: 6px 10px; vertical-align: top; }
.anicca-editor .anicca-editable th { background: var(--anicca-th-bg); font-weight: 600; text-align: left; }
.anicca-editor .anicca-editable figure { margin: 14px 0; text-align: center; }
.anicca-editor .anicca-editable figure img { max-width: 100%; height: auto; border-radius: 4px; }
.anicca-editor .anicca-editable figcaption { margin-top: 6px; font-size: 13px; color: var(--anicca-muted); }
.anicca-editor .anicca-editable figure.embed { position: relative; }
.anicca-editor .anicca-editable figure.embed iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: 6px; }
.anicca-editor .anicca-editable hr { border: none; border-top: 1px solid var(--anicca-border); margin: 16px 0; }
`;

// Read a File into a base64 data URL (fallback when no upload hook is set).
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}
