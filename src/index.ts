export { Editor } from './core/Editor.js';
export type { EditorConfig, ToolbarItemConfig } from './core/Editor.js';
export { EventEmitter } from './core/EventEmitter.js';
export { Schema, defaultSchema } from './core/Schema.js';
export type { SchemaSpec, NodeRule, MarkRule } from './core/Schema.js';
export type { DocData, BlockNodeData, TextNodeData, MarkData } from './core/Model.js';
export { cloneDoc, emptyDoc } from './core/Model.js';
export { History } from './core/History.js';
export { diffDoc, applyPatch, invertPatch, isEmptyPatch } from './core/patch.js';
export type { Patch } from './core/patch.js';
export {
  Collab, transform, transformBoth, applyChange, replaceChange, changeFromPatch,
} from './core/collab.js';
export type { Change, Prim, Side } from './core/collab.js';
export { Command } from './core/Command.js';
export type { ModelPos, ModelSel } from './core/Position.js';
export { Plugin } from './plugins/Plugin.js';

export { BoldPlugin } from './plugins/BoldPlugin.js';
export { ItalicPlugin } from './plugins/ItalicPlugin.js';
export { UnderlinePlugin } from './plugins/UnderlinePlugin.js';
export { StrikethroughPlugin } from './plugins/StrikethroughPlugin.js';
export { HeadingPlugin } from './plugins/HeadingPlugin.js';
export { CodePlugin } from './plugins/CodePlugin.js';
export { CodeBlockPlugin } from './plugins/CodeBlockPlugin.js';
export { BlockQuotePlugin } from './plugins/BlockQuotePlugin.js';
export { ListPlugin } from './plugins/ListPlugin.js';
export { LinkPlugin } from './plugins/LinkPlugin.js';
export { HistoryPlugin } from './plugins/HistoryPlugin.js';
export { TablePlugin } from './plugins/TablePlugin.js';
export { InputRulesPlugin } from './plugins/InputRulesPlugin.js';
export { ImagePlugin } from './plugins/ImagePlugin.js';
export { FindReplacePlugin, findMatches, replaceAll, highlightDoc } from './plugins/FindReplacePlugin.js';
export type { Match } from './plugins/FindReplacePlugin.js';
export { SuperscriptPlugin } from './plugins/SuperscriptPlugin.js';
export { SubscriptPlugin } from './plugins/SubscriptPlugin.js';
export { TextColorPlugin, BackgroundColorPlugin } from './plugins/TextColorPlugin.js';
export { FontSizePlugin } from './plugins/FontSizePlugin.js';
export { FontFamilyPlugin } from './plugins/FontFamilyPlugin.js';
export { AlignPlugin } from './plugins/AlignPlugin.js';
export { MediaEmbedPlugin } from './plugins/MediaEmbedPlugin.js';

export { serialize } from './conversion/Serializer.js';
export { parse } from './conversion/Parser.js';

// Model operations + helpers — build your own plugins on these.
export {
  insertText, deleteRange, deleteBackward, deleteForward,
  splitBlock, mergeBlock, toggleMark, rangeHasMark, setBlockType, blockAt,
  indentListItem, outdentListItem, setMark, removeMark, setBlockAttr,
  insertTable, insertRow, deleteRow, insertColumn, deleteColumn,
  mergeCells, splitCell, deleteTable, toggleHeaderRow, setColumnWidth,
  replaceBlockInlines, sliceSelection, insertFragment, insertImage, updateImage, insertEmbed, blockText,
} from './core/Transaction.js';
export type { TxResult } from './core/Transaction.js';
export { render } from './core/Renderer.js';
export { morph } from './core/morph.js';
export { sanitizeHref, sanitizeImageSrc, sanitizeEmbedSrc, sanitizeFragment } from './core/sanitize.js';
export { pasteToFragment, textToFragment, fragmentText, normalizePastedHtml } from './core/clipboard.js';
export {
  domToModel, modelToDom, readSelection, writeSelection,
  selCollapsed, normalizedRange, collapsed, topLevelBlockIndexOf,
} from './core/Position.js';
