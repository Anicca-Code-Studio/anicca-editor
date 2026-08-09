// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from './Renderer.js';
import { domToModel } from './Position.js';
import type { DocData } from './Model.js';

let editable: HTMLElement;
beforeEach(() => {
  editable = document.createElement('div');
  document.body.appendChild(editable);
});

const twoParas: DocData = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'World' }] },
  ],
};

describe('render', () => {
  it('maps each block to exactly one child node (no stray whitespace nodes)', () => {
    render(editable, twoParas);
    expect(editable.childNodes.length).toBe(2);
    expect((editable.childNodes[0] as Element).tagName).toBe('P');
    expect((editable.childNodes[1] as Element).tagName).toBe('P');
  });

  it('keeps block indices consistent with domToModel after render', () => {
    render(editable, twoParas);
    const secondText = editable.childNodes[1].firstChild!;
    expect(domToModel(editable, secondText, 3)).toEqual({ block: 1, offset: 3 });
  });

  it('renders an empty block with a <br> so it can hold a caret', () => {
    const doc: DocData = { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
    render(editable, doc);
    expect(editable.childNodes.length).toBe(1);
    expect((editable.childNodes[0] as Element).querySelector('br')).not.toBeNull();
  });

  it('preserves marks in output', () => {
    const doc: DocData = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi', marks: [{ type: 'bold' }] }] }],
    };
    render(editable, doc);
    expect(editable.querySelector('strong')?.textContent).toBe('hi');
  });

  it('reuses untouched block nodes across renders (incremental)', () => {
    render(editable, twoParas);
    const p0 = editable.childNodes[0];
    const p1 = editable.childNodes[1];

    // Edit only the first block's text.
    const edited: DocData = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello!' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'World' }] },
      ],
    };
    render(editable, edited);

    // Both block elements are the same DOM objects, not rebuilt.
    expect(editable.childNodes[0]).toBe(p0);
    expect(editable.childNodes[1]).toBe(p1);
    expect(editable.childNodes[0].textContent).toBe('Hello!');
    expect(editable.childNodes[1].textContent).toBe('World');
  });

  it('patches text in place and preserves the text node identity', () => {
    render(editable, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abc' }] }],
    });
    const textNode = editable.childNodes[0].firstChild!;
    render(editable, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'abcd' }] }],
    });
    expect(editable.childNodes[0].firstChild).toBe(textNode);
    expect(textNode.textContent).toBe('abcd');
  });

  it('adds and removes blocks to match the model', () => {
    render(editable, twoParas);
    // grow to three
    render(editable, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'World' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Third' }] },
      ],
    });
    expect(editable.childNodes.length).toBe(3);
    // shrink to one
    render(editable, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Only' }] }] });
    expect(editable.childNodes.length).toBe(1);
    expect(editable.textContent).toBe('Only');
  });

  it('replaces a block when its tag changes', () => {
    render(editable, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] });
    render(editable, { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'x' }] }] });
    expect((editable.childNodes[0] as Element).tagName).toBe('H2');
  });
});
