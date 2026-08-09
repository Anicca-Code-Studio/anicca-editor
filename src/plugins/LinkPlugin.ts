import { Plugin } from './Plugin.js';
import { Command } from '../core/Command.js';
import { toggleMark, rangeHasMark } from '../core/Transaction.js';
import { selCollapsed } from '../core/Position.js';
import { sanitizeHref } from '../core/sanitize.js';
import type { ModelSel } from '../core/Position.js';
import { icons } from '../ui/icons.js';

class LinkCommand extends Command {
  private _popup: HTMLElement | null = null;

  execute(attrs?: Record<string, any>): void {
    const savedSel = this.editor.getSelectionModel();
    if (selCollapsed(savedSel)) return;

    // If the range is already a link, toggle it off directly.
    if (rangeHasMark(this.editor.getDoc(), savedSel, 'link')) {
      this.editor.dispatch(toggleMark(this.editor.getDoc(), savedSel, 'link'));
      return;
    }

    if (attrs?.href != null) {
      this._apply(savedSel, attrs.href);
      return;
    }
    this._openPopup(savedSel);
  }

  refresh(): void {
    this.isEnabled = !selCollapsed(this.editor.getSelectionModel());
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'link');
  }

  private _apply(sel: ModelSel, rawHref: string): void {
    const href = sanitizeHref(rawHref);
    if (!href) return;
    this.editor.dispatch(toggleMark(this.editor.getDoc(), sel, 'link', { href }));
  }

  // A small, non-blocking URL input (replaces window.prompt so nothing freezes).
  private _openPopup(sel: ModelSel): void {
    this._closePopup();
    const container = this.editor.getEditable()?.parentElement;
    if (!container) return;

    const bar = document.createElement('div');
    bar.className = 'anicca-link-popup';
    bar.style.cssText = 'display:flex;gap:6px;padding:6px;border-bottom:1px solid #ccc;background:#eef;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'https://example.com';
    input.style.cssText = 'flex:1;padding:4px 6px;border:1px solid #99a;border-radius:3px;font-size:13px;';

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Apply';
    ok.style.cssText = 'padding:4px 10px;border:1px solid #99a;border-radius:3px;cursor:pointer;';

    const confirm = () => { const v = input.value; this._closePopup(); this._apply(sel, v); };
    ok.addEventListener('mousedown', (e) => { e.preventDefault(); confirm(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      if (e.key === 'Escape') { e.preventDefault(); this._closePopup(); }
    });

    bar.appendChild(input);
    bar.appendChild(ok);
    container.insertBefore(bar, this.editor.getEditable());
    this._popup = bar;
    input.focus();
  }

  private _closePopup(): void {
    this._popup?.remove();
    this._popup = null;
  }
}

export class LinkPlugin extends Plugin {
  static readonly pluginName = 'Link';

  init(): void {
    this.editor.registerCommand('link', new LinkCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'link', label: 'Link', icon: icons.link, command: 'link', tooltip: 'Insert link', group: 'insert' });
  }
}
