// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { setMark, removeMark, setBlockAttr } from '../core/Transaction.js';
import { serialize } from '../conversion/Serializer.js';
import { parse } from '../conversion/Parser.js';
import { sanitizeFragment } from '../core/sanitize.js';
import { defaultSchema } from '../core/Schema.js';
import type { DocData } from '../core/Model.js';

const doc = (content: any[]): DocData => ({ type: 'doc', content });
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const selAll = { anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 5 } };

describe('inline format — sup / sub', () => {
  it('serializes superscript and subscript marks', () => {
    const d = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'superscript' }] }] }]);
    expect(serialize(d)).toBe('<p><sup>x</sup></p>');
    const d2 = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'y', marks: [{ type: 'subscript' }] }] }]);
    expect(serialize(d2)).toBe('<p><sub>y</sub></p>');
  });

  it('parses <sup>/<sub> back into marks', () => {
    expect(parse('<p><sup>a</sup></p>').content[0].content).toEqual([
      { type: 'text', text: 'a', marks: [{ type: 'superscript' }] },
    ]);
  });
});

describe('inline format — color / size marks (set + replace)', () => {
  it('sets a text color and serializes a styled span', () => {
    const out = setMark(doc([p('hello')]), selAll, 'textColor', { color: 'red' });
    expect(serialize(out.doc)).toBe('<p><span style="color:red">hello</span></p>');
  });

  it('replaces an existing color instead of stacking it', () => {
    let out = setMark(doc([p('hello')]), selAll, 'textColor', { color: 'red' });
    out = setMark(out.doc, selAll, 'textColor', { color: 'blue' });
    const marks = (out.doc.content[0].content![0] as any).marks;
    expect(marks.filter((m: any) => m.type === 'textColor')).toHaveLength(1);
    expect(marks.find((m: any) => m.type === 'textColor').attrs.color).toBe('blue');
  });

  it('removeMark strips the color', () => {
    let out = setMark(doc([p('hello')]), selAll, 'textColor', { color: 'red' });
    out = removeMark(out.doc, selAll, 'textColor');
    expect(serialize(out.doc)).toBe('<p>hello</p>');
  });

  it('serializes background-color and font-size', () => {
    const bg = setMark(doc([p('hello')]), selAll, 'backgroundColor', { color: 'yellow' });
    expect(serialize(bg.doc)).toBe('<p><span style="background-color:yellow">hello</span></p>');
    const fs = setMark(doc([p('hello')]), selAll, 'fontSize', { size: '20px' });
    expect(serialize(fs.doc)).toBe('<p><span style="font-size:20px">hello</span></p>');
  });

  it('round-trips a colored span through parse', () => {
    const html = '<p><span style="color:red">hi</span></p>';
    expect(serialize(defaultSchema.normalize(parse(html)))).toBe(html);
  });
});

describe('inline format — font family', () => {
  it('sets a font family and serializes a styled span', () => {
    const out = setMark(doc([p('hello')]), selAll, 'fontFamily', { font: 'Georgia' });
    expect(serialize(out.doc)).toBe('<p><span style="font-family:Georgia">hello</span></p>');
  });

  it('round-trips a font-family span through parse', () => {
    const html = '<p><span style="font-family:Georgia">hi</span></p>';
    expect(serialize(defaultSchema.normalize(parse(html)))).toBe(html);
  });

  it('sanitizer keeps font-family on a span', () => {
    const out = sanitizeFragment('<span style="font-family:Georgia;position:fixed">x</span>');
    expect(out).toContain('font-family');
    expect(out).not.toContain('position');
  });
});

describe('inline format — block align', () => {
  it('sets text-align on a paragraph and serializes it', () => {
    const out = setBlockAttr(doc([p('hi')]), { anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 2 } }, 'align', 'center');
    expect(serialize(out.doc)).toBe('<p style="text-align:center">hi</p>');
  });

  it('left/default drops the style', () => {
    const out = setBlockAttr(doc([p('hi')]), { anchor: { block: 0, offset: 0 }, head: { block: 0, offset: 2 } }, 'align', 'left');
    expect(serialize(out.doc)).toBe('<p>hi</p>');
  });

  it('parses text-align back into an align attr', () => {
    const d = parse('<h2 style="text-align:right">t</h2>');
    expect(d.content[0].attrs?.align).toBe('right');
  });
});

describe('inline format — sanitizer vets styles', () => {
  it('keeps allowed span style props and drops the rest', () => {
    const out = sanitizeFragment('<span style="color:red;position:fixed;top:0">x</span>');
    expect(out).toContain('color:red');
    expect(out).not.toContain('position');
    expect(out).not.toContain('top');
  });

  it('keeps only text-align on block elements', () => {
    const out = sanitizeFragment('<p style="text-align:center;color:red">x</p>');
    expect(out).toContain('text-align:center');
    expect(out).not.toContain('color:red');
  });

  it('drops style entirely from a tag that allows none', () => {
    const out = sanitizeFragment('<strong style="color:red">x</strong>');
    expect(out).not.toContain('style');
  });
});
