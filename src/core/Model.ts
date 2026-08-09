export interface MarkData {
  type: string;
  attrs?: Record<string, any>;
}

export interface TextNodeData {
  type: 'text';
  text: string;
  marks?: MarkData[];
}

export interface BlockNodeData {
  type: string;
  attrs?: Record<string, any>;
  content?: (TextNodeData | BlockNodeData)[];
}

export interface DocData {
  type: 'doc';
  content: BlockNodeData[];
}

export function cloneDoc(doc: DocData): DocData {
  return JSON.parse(JSON.stringify(doc));
}

export function emptyDoc(): DocData {
  return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
}
