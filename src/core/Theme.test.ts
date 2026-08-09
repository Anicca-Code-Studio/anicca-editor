// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from './Editor.js';

describe('theme', () => {
  let host: HTMLElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });

  it('applies the light theme class by default', () => {
    const e = new Editor({ attachTo: host, data: '<p>x</p>' });
    expect(host.classList.contains('anicca-theme-light')).toBe(true);
    e.destroy();
  });

  it('applies a configured dark theme', () => {
    const e = new Editor({ attachTo: host, theme: 'dark', data: '<p>x</p>' });
    expect(host.classList.contains('anicca-theme-dark')).toBe(true);
    e.destroy();
  });

  it('setTheme swaps the theme class', () => {
    const e = new Editor({ attachTo: host, theme: 'light', data: '<p>x</p>' });
    e.setTheme('dark');
    expect(host.classList.contains('anicca-theme-light')).toBe(false);
    expect(host.classList.contains('anicca-theme-dark')).toBe(true);
    expect(e.getTheme()).toBe('dark');
    e.destroy();
  });

  it('applies custom theme colors as inline css variables (camelCase to kebab)', () => {
    const e = new Editor({ attachTo: host, themeColors: { accent: '#e11d48', accentBg: '#fde4ea' }, data: '<p>x</p>' });
    expect(host.style.getPropertyValue('--anicca-accent')).toBe('#e11d48');
    expect(host.style.getPropertyValue('--anicca-accent-bg')).toBe('#fde4ea');
    e.destroy();
  });

  it('setThemeColors updates a token at runtime', () => {
    const e = new Editor({ attachTo: host, data: '<p>x</p>' });
    e.setThemeColors({ accent: '#16a34a' });
    expect(host.style.getPropertyValue('--anicca-accent')).toBe('#16a34a');
    e.destroy();
  });

  it('injects list-style rules so markers survive a host reset', () => {
    new Editor({ attachTo: host, data: '<p>x</p>' });
    const css = document.getElementById('anicca-editor-styles')!.textContent!;
    expect(css).toContain('list-style: disc');
    expect(css).toContain('list-style: decimal');
  });
});
