import { describe, it, expect } from 'vitest';
import { sanitizeHref } from './sanitize.js';

describe('sanitizeHref', () => {
  it('rejects dangerous schemes', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBe('');
    expect(sanitizeHref('  JavaScript:alert(1)')).toBe('');
    expect(sanitizeHref('data:text/html,x')).toBe('');
    expect(sanitizeHref('vbscript:msgbox')).toBe('');
  });

  it('keeps safe absolute urls untouched', () => {
    expect(sanitizeHref('https://x.com')).toBe('https://x.com');
    expect(sanitizeHref('http://x.com/a?b=1')).toBe('http://x.com/a?b=1');
    expect(sanitizeHref('mailto:a@b.com')).toBe('mailto:a@b.com');
    expect(sanitizeHref('/relative')).toBe('/relative');
    expect(sanitizeHref('#anchor')).toBe('#anchor');
  });

  it('prepends https:// to bare hosts', () => {
    expect(sanitizeHref('example.com')).toBe('https://example.com');
    expect(sanitizeHref('  example.com/path ')).toBe('https://example.com/path');
  });

  it('returns empty for blank input', () => {
    expect(sanitizeHref('')).toBe('');
    expect(sanitizeHref('   ')).toBe('');
  });
});
