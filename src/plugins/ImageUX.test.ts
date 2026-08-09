// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { updateImage } from '../core/Transaction.js';
import { serialize } from '../conversion/Serializer.js';
import { parse } from '../conversion/Parser.js';
import { defaultSchema } from '../core/Schema.js';
import { Editor } from '../core/Editor.js';
import { ImagePlugin } from './ImagePlugin.js';
import type { DocData } from '../core/Model.js';

const imgDoc = (attrs: any): DocData => ({ type: 'doc', content: [{ type: 'image', attrs }] });

describe('image UX — updateImage op', () => {
  it('patches width / align / caption onto the image block', () => {
    const out = updateImage(imgDoc({ src: 'a.png', alt: 'x' }), 0, { width: 50, align: 'center', caption: 'cap' });
    expect(out.doc.content[0].attrs).toEqual({ src: 'a.png', alt: 'x', width: 50, align: 'center', caption: 'cap' });
  });

  it('clears width/align/caption when reset to empty', () => {
    let out = updateImage(imgDoc({ src: 'a.png', alt: 'x', width: 50, align: 'center', caption: 'c' }), 0, { width: null, align: '', caption: '' });
    expect(out.doc.content[0].attrs).toEqual({ src: 'a.png', alt: 'x' });
  });

  it('is a no-op on a non-image block', () => {
    const d: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    expect(updateImage(d, 0, { width: 50 }).doc).toEqual(d);
  });
});

describe('image UX — serialize / parse', () => {
  it('serializes width, align and caption', () => {
    const html = serialize(imgDoc({ src: 'a.png', alt: 'x', width: 50, align: 'center', caption: 'cap' }));
    expect(html).toBe('<figure contenteditable="false" style="text-align:center"><img src="a.png" alt="x" style="width:50%"><figcaption>cap</figcaption></figure>');
  });

  it('serializes a bare image unchanged (backwards compatible)', () => {
    expect(serialize(imgDoc({ src: 'a.png', alt: 'x' })))
      .toBe('<figure contenteditable="false"><img src="a.png" alt="x"></figure>');
  });

  it('round-trips a fully-styled image through the schema', () => {
    const html = '<figure contenteditable="false" style="text-align:right"><img src="a.png" alt="x" style="width:75%"><figcaption>hi</figcaption></figure>';
    expect(serialize(defaultSchema.normalize(parse(html)))).toBe(html);
  });
});

describe('image UX — resize handle', () => {
  let host: HTMLElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });

  it('shows a resize handle when a figure is clicked', () => {
    const editor = new Editor({ attachTo: host, plugins: [ImagePlugin], data: '<figure><img src="a.png" alt="x"></figure>' });
    const fig = host.querySelector('figure')!;
    fig.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(host.querySelector('.anicca-resize-handle')).not.toBeNull();
    editor.destroy();
  });
});
