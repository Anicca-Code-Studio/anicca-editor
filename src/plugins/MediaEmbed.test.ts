// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeEmbedSrc } from '../core/sanitize.js';
import { insertEmbed } from '../core/Transaction.js';
import { serialize } from '../conversion/Serializer.js';
import { parse } from '../conversion/Parser.js';
import { defaultSchema } from '../core/Schema.js';
import { collapsed } from '../core/Position.js';
import type { DocData } from '../core/Model.js';

const doc = (content: any[]): DocData => ({ type: 'doc', content });
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('media embed — sanitizeEmbedSrc allowlist', () => {
  it('normalizes a YouTube watch URL to an embed URL', () => {
    expect(sanitizeEmbedSrc('https://www.youtube.com/watch?v=abc123XYZ')).toBe('https://www.youtube.com/embed/abc123XYZ');
  });
  it('normalizes youtu.be short links', () => {
    expect(sanitizeEmbedSrc('https://youtu.be/abc123XYZ')).toBe('https://www.youtube.com/embed/abc123XYZ');
  });
  it('normalizes a Vimeo URL', () => {
    expect(sanitizeEmbedSrc('https://vimeo.com/12345')).toBe('https://player.vimeo.com/video/12345');
  });
  it('rejects javascript: and unknown hosts', () => {
    expect(sanitizeEmbedSrc('javascript:alert(1)')).toBe('');
    expect(sanitizeEmbedSrc('https://evil.example.com/x')).toBe('');
    expect(sanitizeEmbedSrc('')).toBe('');
  });
});

describe('media embed — insert op', () => {
  it('inserts an embed block after the caret and a trailing paragraph', () => {
    const out = insertEmbed(doc([p('a')]), collapsed(0, 1), { src: 'https://www.youtube.com/embed/x' });
    expect(out.doc.content.map(b => b.type)).toEqual(['paragraph', 'embed', 'paragraph']);
  });
});

describe('media embed — serialize / parse', () => {
  it('serializes an embed as a sandboxed iframe figure', () => {
    const d = doc([{ type: 'embed', attrs: { src: 'https://www.youtube.com/embed/x' } }]);
    expect(serialize(d)).toBe('<figure class="embed" contenteditable="false"><iframe src="https://www.youtube.com/embed/x" frameborder="0" allowfullscreen></iframe></figure>');
  });

  it('drops an embed whose src is not allowlisted', () => {
    const d = doc([{ type: 'embed', attrs: { src: 'https://evil.example.com/x' } }]);
    expect(serialize(d)).toBe('');
  });

  it('round-trips an embed through the schema', () => {
    const html = '<figure class="embed" contenteditable="false"><iframe src="https://www.youtube.com/embed/x" frameborder="0" allowfullscreen></iframe></figure>';
    expect(serialize(defaultSchema.normalize(parse(html)))).toBe(html);
  });

  it('parse drops a pasted iframe from an untrusted host', () => {
    const d = parse('<figure class="embed"><iframe src="https://evil.example.com/x"></iframe></figure>');
    // no valid embed remains -> normalized to an empty paragraph
    expect(d.content.every(b => b.type !== 'embed')).toBe(true);
  });
});
