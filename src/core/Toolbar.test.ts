// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from './Editor.js';
import { HistoryPlugin } from '../plugins/HistoryPlugin.js';
import { BoldPlugin } from '../plugins/BoldPlugin.js';
import { FontFamilyPlugin } from '../plugins/FontFamilyPlugin.js';

describe('toolbar rendering', () => {
  let host: HTMLElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });

  it('renders buttons with an inline SVG icon', () => {
    const editor = new Editor({ attachTo: host, plugins: [BoldPlugin], data: '<p>x</p>' });
    const btn = host.querySelector('[data-toolbar-item="bold"]')!;
    expect(btn.querySelector('svg')).not.toBeNull();
    editor.destroy();
  });

  it('draws a separator between toolbar groups', () => {
    // history group (undo/redo) then format group (bold) => one separator.
    const editor = new Editor({ attachTo: host, plugins: [HistoryPlugin, BoldPlugin], data: '<p>x</p>' });
    expect(host.querySelectorAll('.anicca-sep').length).toBe(1);
    editor.destroy();
  });

  it('renders a select for select-type items', () => {
    const editor = new Editor({ attachTo: host, plugins: [FontFamilyPlugin], data: '<p>x</p>' });
    const sel = host.querySelector('select[data-toolbar-item="fontFamily"]');
    expect(sel).not.toBeNull();
    editor.destroy();
  });

  it('injects the stylesheet once even with two editors', () => {
    const a = new Editor({ attachTo: host, plugins: [BoldPlugin], data: '<p>x</p>' });
    const host2 = document.createElement('div'); document.body.appendChild(host2);
    const b = new Editor({ attachTo: host2, plugins: [BoldPlugin], data: '<p>y</p>' });
    expect(document.querySelectorAll('#anicca-editor-styles').length).toBe(1);
    a.destroy(); b.destroy();
  });
});
