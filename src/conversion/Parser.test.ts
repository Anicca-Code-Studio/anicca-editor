// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parse } from './Parser.js';
import { serialize } from './Serializer.js';

describe('parse (lists)', () => {
  it('expands a <ul> into flat bullet list_item blocks', () => {
    const doc = parse('<ul><li>a</li><li>b</li></ul>');
    expect(doc.content).toEqual([
      { type: 'list_item', attrs: { kind: 'bullet' }, content: [{ type: 'text', text: 'a' }] },
      { type: 'list_item', attrs: { kind: 'bullet' }, content: [{ type: 'text', text: 'b' }] },
    ]);
  });

  it('expands an <ol> into ordered list_item blocks', () => {
    const doc = parse('<ol><li>x</li></ol>');
    expect(doc.content[0]).toEqual({ type: 'list_item', attrs: { kind: 'ordered' }, content: [{ type: 'text', text: 'x' }] });
  });

  it('round-trips a mixed document', () => {
    const html = '<p>x</p><ul><li>a</li><li>b</li></ul><ol><li>c</li></ol>';
    expect(serialize(parse(html))).toBe(html);
  });
});
