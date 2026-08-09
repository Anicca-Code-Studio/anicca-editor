// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '../core/Editor.js';
import { FindReplacePlugin, findMatches, replaceAll, highlightDoc } from './FindReplacePlugin.js';
import { serialize } from '../conversion/Serializer.js';
import type { DocData } from '../core/Model.js';

const doc: DocData = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'the cat sat' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'on the mat' }] },
  ],
};

describe('findMatches', () => {
  it('finds every occurrence across blocks', () => {
    expect(findMatches(doc, 'the')).toEqual([
      { block: 0, from: 0, to: 3 },
      { block: 1, from: 3, to: 6 },
    ]);
  });

  it('is case-insensitive by default and case-sensitive on request', () => {
    const d: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The the' }] }] };
    expect(findMatches(d, 'the').length).toBe(2);
    expect(findMatches(d, 'the', true).length).toBe(1);
  });

  it('returns nothing for an empty query', () => {
    expect(findMatches(doc, '')).toEqual([]);
  });
});

describe('replaceAll', () => {
  it('replaces every occurrence, later matches first so offsets stay valid', () => {
    const out = replaceAll(doc, 'the', 'THEE');
    expect(out.content[0].content).toEqual([{ type: 'text', text: 'THEE cat sat' }]);
    expect(out.content[1].content).toEqual([{ type: 'text', text: 'on THEE mat' }]);
  });

  it('handles multiple matches in one block', () => {
    const d: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a a a' }] }] };
    expect(replaceAll(d, 'a', 'bb').content[0].content).toEqual([{ type: 'text', text: 'bb bb bb' }]);
  });
});

describe('highlightDoc', () => {
  it('wraps matches in a highlight mark that serializes to <mark>', () => {
    const matches = findMatches(doc, 'cat');
    const html = serialize(highlightDoc(doc, matches));
    expect(html).toMatch(/<mark>cat<\/mark>/);
  });
});

describe('FindReplacePlugin (integration)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('replaceAll edits the document through history', () => {
    const editor = new Editor({ attachTo: host, plugins: [FindReplacePlugin], data: '<p>the cat</p>' });
    const fr = editor.getPlugin(FindReplacePlugin)!;
    fr.replaceAll('the', 'a');
    expect(editor.getDoc().content[0].content).toEqual([{ type: 'text', text: 'a cat' }]);
    editor.undo();
    expect(editor.getDoc().content[0].content).toEqual([{ type: 'text', text: 'the cat' }]);
  });

  it('find previews highlighted matches without changing the model', () => {
    const editor = new Editor({ attachTo: host, plugins: [FindReplacePlugin], data: '<p>the cat</p>' });
    const fr = editor.getPlugin(FindReplacePlugin)!;
    fr.find('cat');
    expect(editor.getEditable()!.querySelector('mark')?.textContent).toBe('cat');
    // model is untouched by the preview
    expect(editor.getDoc().content[0].content).toEqual([{ type: 'text', text: 'the cat' }]);
  });
});
