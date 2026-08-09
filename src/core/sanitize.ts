// Normalize and vet a user-supplied URL for use in an href.
// Rejects script-bearing schemes; leaves safe absolute/relative URLs alone;
// assumes https:// for bare hosts. Returns '' when nothing safe remains.

const DANGEROUS = /^(javascript|data|vbscript):/i;
const SAFE_ABSOLUTE = /^(https?:\/\/|mailto:|tel:)/i;

export function sanitizeHref(raw: string): string {
  const url = (raw ?? '').trim();
  if (!url) return '';
  if (DANGEROUS.test(url)) return '';
  if (SAFE_ABSOLUTE.test(url)) return url;
  if (url.startsWith('/') || url.startsWith('#')) return url;
  return 'https://' + url;
}

// Vet an image src: allow http(s) and relative paths untouched, allow inline
// `data:image/...` (so base64 fallbacks work), and reject scripting schemes and
// non-image data URIs. Unlike sanitizeHref it never rewrites a bare path into
// an absolute https URL, so `a.png` stays `a.png`.
export function sanitizeImageSrc(raw: string): string {
  const url = (raw ?? '').trim();
  if (!url) return '';
  if (/^(javascript|vbscript):/i.test(url)) return '';
  if (/^data:image\//i.test(url)) return url;
  if (/^data:/i.test(url)) return '';
  return url;
}

// Vet + normalize a media-embed URL down to a known, embeddable provider.
// Accepts only YouTube and Vimeo, rewriting share/watch URLs into their
// canonical /embed form; everything else (including javascript:/data:) returns
// '' so nothing arbitrary can end up in an <iframe src>.
export function sanitizeEmbedSrc(raw: string): string {
  const url = (raw ?? '').trim();
  if (!url) return '';
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/i);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vi = url.match(/(?:player\.vimeo\.com\/video\/|vimeo\.com\/)(\d+)/i);
  if (vi) return `https://player.vimeo.com/video/${vi[1]}`;
  return '';
}

// ---- fragment sanitizer (paste path) ----
// Allowlist of tags the model can represent, plus the few attributes each may
// legitimately carry. Anything outside the list is dropped; script/style
// subtrees are removed entirely so nothing executable survives a paste.

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE',
  'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL', 'A',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'COLGROUP', 'COL', 'IMG',
  'SPAN', 'DIV', 'ARTICLE', 'SECTION',
]);
const DROP_SUBTREE = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href']),
  IMG: new Set(['src', 'alt']),
  TD: new Set(['colspan', 'rowspan']),
  TH: new Set(['colspan', 'rowspan']),
  COL: new Set(['style']),
  SPAN: new Set(['style']),
  P: new Set(['style']),
  H1: new Set(['style']), H2: new Set(['style']), H3: new Set(['style']),
  H4: new Set(['style']), H5: new Set(['style']), H6: new Set(['style']),
  BLOCKQUOTE: new Set(['style']),
};

// Which CSS properties each tag may keep in its inline `style`. Anything else
// is stripped, so a paste cannot smuggle in positioning / behaviour via CSS.
const STYLE_ALLOW: Record<string, Set<string>> = {
  SPAN: new Set(['color', 'background-color', 'font-size', 'font-family']),
  P: new Set(['text-align']),
  H1: new Set(['text-align']), H2: new Set(['text-align']), H3: new Set(['text-align']),
  H4: new Set(['text-align']), H5: new Set(['text-align']), H6: new Set(['text-align']),
  BLOCKQUOTE: new Set(['text-align']),
};

// Keep only the allowlisted declarations from an inline style string.
function filterStyle(raw: string, allowed: Set<string>): string {
  return raw
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(decl => {
      const i = decl.indexOf(':');
      if (i < 0) return false;
      return allowed.has(decl.slice(0, i).trim().toLowerCase());
    })
    .join(';');
}

function scrubElement(el: Element): void {
  for (const child of Array.from(el.children)) {
    if (DROP_SUBTREE.has(child.tagName)) {
      child.remove();
      continue;
    }
    scrubElement(child);
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Unwrap unknown tags: keep their (already scrubbed) children.
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }
    const allowed = ALLOWED_ATTRS[child.tagName] ?? new Set<string>();
    for (const attr of Array.from(child.attributes)) {
      if (!allowed.has(attr.name)) {
        child.removeAttribute(attr.name);
      }
    }
    if (child.tagName === 'A') {
      const safe = sanitizeHref(child.getAttribute('href') ?? '');
      if (safe) child.setAttribute('href', safe); else child.removeAttribute('href');
    }
    if (child.tagName === 'IMG') {
      const safe = sanitizeImageSrc(child.getAttribute('src') ?? '');
      if (safe) child.setAttribute('src', safe); else child.remove();
    }
    if (child.tagName === 'COL') {
      // Keep only a width:NN% style; drop anything else.
      const m = child.getAttribute('style')?.match(/width:\s*[\d.]+%/i);
      if (m) child.setAttribute('style', m[0]); else child.removeAttribute('style');
    } else if (child.hasAttribute('style') && STYLE_ALLOW[child.tagName]) {
      const kept = filterStyle(child.getAttribute('style') ?? '', STYLE_ALLOW[child.tagName]);
      if (kept) child.setAttribute('style', kept); else child.removeAttribute('style');
    }
  }
}

/** Sanitize arbitrary pasted HTML down to the allowlisted, model-safe subset. */
export function sanitizeFragment(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = html;
  scrubElement(root);
  return root.innerHTML;
}
