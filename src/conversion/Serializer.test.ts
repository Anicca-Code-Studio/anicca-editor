import { describe, it, expect } from 'vitest';
import { serialize } from './Serializer.js';
import type { DocData } from '../core/Model.js';

const doc = (content: any[]): DocData => ({ type: 'doc', content });
const li = (text: string, kind: 'bullet' | 'ordered') => ({
  type: 'list_item', attrs: { kind }, content: [{ type: 'text', text }],
});
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('serialize', () => {
  it('joins blocks without stray newlines', () => {
    expect(serialize(doc([p('a'), p('b')]))).toBe('<p>a</p><p>b</p>');
  });

  it('groups consecutive bullet list items into one <ul>', () => {
    expect(serialize(doc([li('a', 'bullet'), li('b', 'bullet')])))
      .toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('groups ordered items into <ol> and separates different kinds', () => {
    expect(serialize(doc([li('a', 'bullet'), li('b', 'ordered')])))
      .toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
  });

  it('keeps paragraphs around a list', () => {
    expect(serialize(doc([p('x'), li('a', 'bullet'), p('y')])))
      .toBe('<p>x</p><ul><li>a</li></ul><p>y</p>');
  });
});
