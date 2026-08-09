# anicca-editor

A framework-agnostic rich text editor engine. The document is a plain JSON model, every edit is a
pure function over that model, and the DOM is reconciled to match. It does not use `execCommand`.
It has its own plugin system and no runtime dependencies. The package ships ESM, CommonJS, and
TypeScript types.

## Features

Marks:

- bold, italic, underline, strikethrough, code, link, highlight
- superscript, subscript
- text color, background color, font size

Blocks:

- paragraph, headings (h1 to h6), blockquote, code block
- bullet and ordered lists with Tab and Shift+Tab nesting
- tables (insert, add or remove rows and columns, merge and split cells, header row, column width)
- image and media embed (YouTube and Vimeo)
- horizontal rule
- left, center, right, and justify alignment

Editing:

- markdown input rules (type `# ` for a heading, `- ` for a list, `**bold**`, and so on)
- find and replace with a non-destructive highlight preview
- clipboard copy, cut, and paste with Word and Google Docs cleanup
- image drop, paste, and an upload hook, plus drag resize, caption, and align
- IME and composition support
- undo and redo with typing coalescing, stored as reversible patches with a depth cap
- operational transform for collaboration (block level, transport agnostic)
- an accessible toolbar (ARIA roles, `aria-pressed`, roving tabindex)

## Install

```
npm install anicca-editor
```

## Quick start

```html
<div id="editor"></div>
```

```js
import {
  Editor,
  HistoryPlugin, BoldPlugin, ItalicPlugin, HeadingPlugin,
  ListPlugin, LinkPlugin, TablePlugin, ImagePlugin,
  InputRulesPlugin, FindReplacePlugin,
} from 'anicca-editor';

const editor = new Editor({
  attachTo: document.getElementById('editor'),
  plugins: [
    HistoryPlugin, BoldPlugin, ItalicPlugin, HeadingPlugin,
    ListPlugin, LinkPlugin, TablePlugin, ImagePlugin,
    InputRulesPlugin, FindReplacePlugin,
  ],
  data: '<p>Hello <strong>anicca</strong></p>',
});

editor.on('change', () => {
  console.log(editor.getData());
});
```

The editor renders a toolbar and an editable area inside the element you pass to `attachTo`. Only
the plugins you list are active, so you pay for what you use.

## Configuration

`new Editor(config)` accepts:

- `attachTo` (required): the host `HTMLElement`.
- `plugins`: an array of plugin classes.
- `data`: initial content as an HTML string.
- `schema`: a custom `Schema` (defaults to `defaultSchema`).
- `placeholder`: placeholder text and the editable `aria-label`.
- `upload`: `(file: File) => Promise<string>`. When set, pasted or dropped image files are sent to
  it and the returned URL is stored. Without it, image files fall back to a base64 data URL.
- `historyLimit`: maximum undo depth before the oldest step is dropped (default 1000).

## Editor API

- `getData(): string` and `setData(html: string): void` read and write content as HTML.
- `getDoc(): DocData` and `setDoc(doc): void` read and write the JSON model directly.
- `execute(command, attrs?)` runs a registered command, for example `editor.execute('bold')`,
  `editor.execute('heading', { level: 2 })`, `editor.execute('bulletList')`.
- `undo()` and `redo()`.
- `getVersion(): number` returns a revision counter that increases on every committed change.
- `applyExternalChange(change)` applies a remote collaboration change without touching local undo.
- `getPlugin(PluginClass)` returns an initialized plugin instance, or null.
- `getEditable()` returns the editable element.
- `destroy()` removes the editor and its listeners.

Events (subscribe with `editor.on(name, handler)`):

- `change`: the document changed.
- `step`: a serializable operation, `{ patch, version }`, for persistence or transport.
- `ready`: the editable is mounted (plugins that need DOM wire up here).
- `keydown`: a key event on the editable.
- `selectionChange`: the selection moved.

## Plugins

Import a plugin class and pass it in `plugins`. Each one registers commands and toolbar items.

| Plugin | Adds |
| --- | --- |
| `HistoryPlugin` | undo and redo, with Ctrl+Z and Ctrl+Y |
| `BoldPlugin`, `ItalicPlugin`, `UnderlinePlugin`, `StrikethroughPlugin` | basic marks |
| `CodePlugin` | inline code mark |
| `SuperscriptPlugin`, `SubscriptPlugin` | superscript and subscript |
| `TextColorPlugin`, `BackgroundColorPlugin` | text and background color |
| `FontSizePlugin` | font size |
| `AlignPlugin` | block alignment |
| `HeadingPlugin` | headings and paragraph |
| `BlockQuotePlugin` | blockquote |
| `CodeBlockPlugin` | code block |
| `ListPlugin` | bullet and ordered lists, indent and outdent |
| `LinkPlugin` | links |
| `TablePlugin` | tables and table editing |
| `ImagePlugin` | insert image, drag resize, caption, align |
| `MediaEmbedPlugin` | embed YouTube and Vimeo |
| `InputRulesPlugin` | markdown shortcuts while typing |
| `FindReplacePlugin` | find and replace API with highlight preview |

## Data model

The document is a `DocData` value: a `doc` node holding an array of block nodes, each with optional
`attrs` and `content`. Text nodes carry an optional `marks` array. Convert between HTML and the
model with `serialize(doc)` and `parse(html)`. The model is the source of truth; the DOM is a
projection of it.

## Collaboration

Changes are exposed as serializable operations through the `step` event and can be merged with a
block level operational transform. This is transport agnostic. You provide the channel; the library
provides convergence.

```js
import { Collab, transform, applyChange, changeFromPatch } from 'anicca-editor';

// each peer has an id used as a global tie-break
const collab = new Collab(myPeerId);

editor.on('step', ({ patch }) => {
  const change = changeFromPatch(patch);
  collab.local(change);
  send(change, myPeerId); // your transport
});

onReceive((remoteChange, remoteId) => {
  const applied = collab.receive(remoteChange, remoteId);
  editor.applyExternalChange(applied);
});
```

Two peers that each see the other's change converge to the same document. Concurrency is resolved
at block granularity: if two peers edit the same block at the same time, one edit wins by the tie
break rather than the document becoming corrupt. Character level merging inside a single block and a
bundled network server are not included.

## Writing a plugin

A plugin registers commands and toolbar items. A command runs a model operation from
`Transaction`. Nothing touches the DOM directly.

```js
import { Plugin, Command, toggleMark, rangeHasMark } from 'anicca-editor';

class HighlightCommand extends Command {
  execute() {
    this.editor.applyOp((doc, sel) => toggleMark(doc, sel, 'highlight'));
  }
  refresh() {
    this.value = rangeHasMark(this.editor.getDoc(), this.editor.getSelectionModel(), 'highlight');
  }
}

export class HighlightPlugin extends Plugin {
  init() {
    this.editor.registerCommand('highlight', new HighlightCommand(this.editor));
    this.editor.registerToolbarItem({ name: 'highlight', label: 'H', command: 'highlight' });
  }
}
```

The model operations (`insertText`, `toggleMark`, `setBlockType`, `insertTable`, `insertImage`, and
others) are exported so you can build commands on top of them.

## Scripts

- `npm run build`: bundle to `dist` with tsup.
- `npm test`: run the test suite with vitest.
- `npm run test:watch`: run vitest in watch mode.
- `npm run typecheck`: type check with `tsc --noEmit`.
- `npm run demo`: serve the repository so you can open `test/index.html` in a browser.

## Requirements

The editor runs in a browser, since it needs a DOM. Node is used only for building and testing.
Pure functions such as `serialize`, `diffDoc`, `transform`, and `applyChange` also run in Node
without a DOM.

## License

MIT. See the `LICENSE` file.
