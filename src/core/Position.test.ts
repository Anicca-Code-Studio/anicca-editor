// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { domToModel, modelToDom } from './Position.js';

let editable: HTMLElement;

beforeEach(() => {
  editable = document.createElement('div');
  document.body.appendChild(editable);
});

function firstText(el: Node): Text {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  return w.nextNode() as Text;
}

describe('domToModel', () => {
  it('maps a caret in a plain paragraph', () => {
    editable.innerHTML = '<p>Hello</p>';
    const t = firstText(editable.children[0]);
    expect(domToModel(editable, t, 2)).toEqual({ block: 0, offset: 2 });
  });

  it('maps a caret inside a nested mark', () => {
    editable.innerHTML = '<p>He<strong>ll</strong>o</p>';
    const strongText = firstText(editable.querySelector('strong')!);
    expect(domToModel(editable, strongText, 1)).toEqual({ block: 0, offset: 3 });
  });

  it('maps a caret in a later block', () => {
    editable.innerHTML = '<p>A</p><p>BC</p>';
    const t = firstText(editable.children[1]);
    expect(domToModel(editable, t, 1)).toEqual({ block: 1, offset: 1 });
  });
});

describe('modelToDom', () => {
  it('resolves a position in a plain paragraph', () => {
    editable.innerHTML = '<p>Hello</p>';
    const { node, offset } = modelToDom(editable, { block: 0, offset: 2 });
    expect(node.textContent).toBe('Hello');
    expect(offset).toBe(2);
  });

  it('resolves a position inside a nested mark', () => {
    editable.innerHTML = '<p>He<strong>ll</strong>o</p>';
    const { node, offset } = modelToDom(editable, { block: 0, offset: 3 });
    expect(node.textContent).toBe('ll');
    expect(offset).toBe(1);
  });

  it('resolves the start of an empty block to the block element', () => {
    editable.innerHTML = '<p><br></p>';
    const { node, offset } = modelToDom(editable, { block: 0, offset: 0 });
    expect((node as Element).tagName ?? node.nodeName).toBe('P');
    expect(offset).toBe(0);
  });
});

describe('round-trip', () => {
  it('domToModel then modelToDom returns an equivalent caret', () => {
    editable.innerHTML = '<p>He<strong>ll</strong>o</p>';
    const strongText = firstText(editable.querySelector('strong')!);
    const pos = domToModel(editable, strongText, 1);
    const dom = modelToDom(editable, pos);
    const back = domToModel(editable, dom.node, dom.offset);
    expect(back).toEqual(pos);
  });
});

describe('lists (leaf-block enumeration)', () => {
  it('treats each <li> as its own block after any paragraphs', () => {
    editable.innerHTML = '<p>A</p><ul><li>B</li><li>C</li></ul>';
    const cText = editable.querySelectorAll('li')[1].firstChild!;
    expect(domToModel(editable, cText, 1)).toEqual({ block: 2, offset: 1 });
  });

  it('modelToDom resolves a position inside a list item', () => {
    editable.innerHTML = '<p>A</p><ul><li>B</li><li>C</li></ul>';
    const { node, offset } = modelToDom(editable, { block: 2, offset: 1 });
    expect(node.textContent).toBe('C');
    expect(offset).toBe(1);
  });
});
