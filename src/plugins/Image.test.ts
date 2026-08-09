// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { Editor } from '../core/Editor.js';
import { ImagePlugin } from './ImagePlugin.js';
import { insertImage } from '../core/Transaction.js';
import { parse } from '../conversion/Parser.js';
import { serialize } from '../conversion/Serializer.js';
import { defaultSchema } from '../core/Schema.js';
import type { DocData } from '../core/Model.js';

describe('insertImage', () => {
  it('inserts an image block after the current block with a caret paragraph after it', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] };
    const out = insertImage(doc, { anchor: { block: 0, offset: 1 }, head: { block: 0, offset: 1 } }, { src: 'a.png', alt: 'x' });
    expect(out.doc.content.map(b => b.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(out.doc.content[1].attrs).toEqual({ src: 'a.png', alt: 'x' });
    expect(out.sel.head).toEqual({ block: 2, offset: 0 });
  });
});

describe('image conversion', () => {
  it('parses <img> and <figure><img></figure> into an image block', () => {
    expect(parse('<img src="a.png" alt="x">').content[0]).toEqual({ type: 'image', attrs: { src: 'a.png', alt: 'x' } });
    expect(parse('<figure><img src="b.png"></figure>').content[0]).toEqual({ type: 'image', attrs: { src: 'b.png', alt: '' } });
  });

  it('serializes an image block to a non-editable figure/img', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'image', attrs: { src: 'a.png', alt: 'x' } }] };
    const html = serialize(doc);
    expect(html).toMatch(/<figure[^>]*contenteditable="false"/);
    expect(html).toMatch(/<img src="a\.png" alt="x">/);
  });

  it('roundtrips through parse and serialize', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'image', attrs: { src: 'a.png', alt: 'x' } }] };
    expect(parse(serialize(doc)).content[0]).toEqual(doc.content[0]);
  });

  it('is an allowed schema node and survives normalize', () => {
    expect(defaultSchema.isNodeAllowed('image')).toBe(true);
    const doc: DocData = { type: 'doc', content: [{ type: 'image', attrs: { src: 'a.png', alt: '' } }] };
    expect(defaultSchema.normalize(doc).content[0]).toEqual({ type: 'image', attrs: { src: 'a.png', alt: '' } });
  });
});

describe('ImagePlugin', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('inserts an image via the command', () => {
    const editor = new Editor({ attachTo: host, plugins: [ImagePlugin], data: '<p>hi</p>' });
    editor.execute('image', { src: 'x.png', alt: 'pic' });
    const types = editor.getDoc().content.map(b => b.type);
    expect(types).toContain('image');
    const img = editor.getDoc().content.find(b => b.type === 'image');
    expect(img!.attrs).toEqual({ src: 'x.png', alt: 'pic' });
  });

  it('renders the image atomically as a non-editable figure', () => {
    const editor = new Editor({ attachTo: host, plugins: [ImagePlugin], data: '<p>hi</p>' });
    editor.execute('image', { src: 'x.png', alt: 'pic' });
    const figure = editor.getEditable()!.querySelector('figure');
    expect(figure).not.toBeNull();
    expect(figure!.getAttribute('contenteditable')).toBe('false');
    expect(figure!.querySelector('img')!.getAttribute('src')).toBe('x.png');
  });
});
