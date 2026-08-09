// Minimal in-place DOM reconciler. Patches a live element tree to match a
// freshly built target tree, reusing existing nodes wherever their type
// matches so the browser keeps caret, focus, and IME composition intact and
// the work scales with the size of the change, not the whole document.
//
// Matching is positional (index by index). That fits this editor's edit
// profile (text edits, block splits/merges, appends) where nodes rarely
// reorder; a reorder degrades to more replacement but never to incorrect DOM.

function sameType(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType === Node.ELEMENT_NODE) {
    return (a as Element).tagName === (b as Element).tagName;
  }
  return true;
}

function syncAttrs(current: Element, target: Element): void {
  // Remove attributes that no longer exist on the target.
  for (const attr of Array.from(current.attributes)) {
    if (!target.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  // Add or update attributes from the target.
  for (const attr of Array.from(target.attributes)) {
    if (current.getAttribute(attr.name) !== attr.value) {
      current.setAttribute(attr.name, attr.value);
    }
  }
}

function morphNode(current: Node, target: Node): void {
  if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
    if (current.textContent !== target.textContent) current.textContent = target.textContent;
    return;
  }
  if (current.nodeType === Node.ELEMENT_NODE) {
    syncAttrs(current as Element, target as Element);
    morphChildren(current, target);
  }
}

function morphChildren(current: Node, target: Node): void {
  const tChildren = target.childNodes;
  for (let i = 0; i < tChildren.length; i++) {
    const t = tChildren[i];
    const c = current.childNodes[i];
    if (!c) {
      current.appendChild(current.ownerDocument!.importNode(t, true));
    } else if (sameType(c, t)) {
      morphNode(c, t);
    } else {
      current.replaceChild(current.ownerDocument!.importNode(t, true), c);
    }
  }
  // Drop any surplus trailing nodes the target no longer has.
  while (current.childNodes.length > tChildren.length) {
    current.removeChild(current.lastChild!);
  }
}

/** Reconcile `current`'s children in place to match `target`'s children. */
export function morph(current: HTMLElement, target: HTMLElement): void {
  morphChildren(current, target);
}
