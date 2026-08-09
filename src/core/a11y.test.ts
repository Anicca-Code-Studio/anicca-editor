// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from './Editor.js';
import { BoldPlugin } from '../plugins/BoldPlugin.js';
import { ItalicPlugin } from '../plugins/ItalicPlugin.js';

describe('accessibility', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('marks the editable as an accessible multiline textbox', () => {
    const editor = new Editor({ attachTo: host, data: '<p>x</p>' });
    const ed = editor.getEditable()!;
    expect(ed.getAttribute('role')).toBe('textbox');
    expect(ed.getAttribute('aria-multiline')).toBe('true');
    expect(ed.hasAttribute('aria-label')).toBe(true);
  });

  it('exposes the toolbar with a role and default pressed state', () => {
    const editor = new Editor({ attachTo: host, plugins: [BoldPlugin], data: '<p>x</p>' });
    const tb = host.querySelector('.anicca-toolbar')!;
    expect(tb.getAttribute('role')).toBe('toolbar');
    const btn = tb.querySelector('[data-toolbar-item="bold"]')!;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('uses a roving tabindex navigable with the arrow keys', () => {
    const editor = new Editor({ attachTo: host, plugins: [BoldPlugin, ItalicPlugin], data: '<p>x</p>' });
    const tb = host.querySelector('.anicca-toolbar')!;
    const items = tb.querySelectorAll<HTMLElement>('[data-toolbar-item]');
    expect(items[0].getAttribute('tabindex')).toBe('0');
    expect(items[1].getAttribute('tabindex')).toBe('-1');

    items[0].focus();
    tb.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(document.activeElement).toBe(items[1]);
    expect(items[1].getAttribute('tabindex')).toBe('0');
    expect(items[0].getAttribute('tabindex')).toBe('-1');
  });
});
