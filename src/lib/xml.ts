/**
 * XML: well-formedness, pretty-print, minify.
 *
 * The parser is the browser's. DOMParser with `application/xml` is the same
 * engine that will be applied to the document anywhere else in the page, so
 * a pass here is a pass there. This is well-formedness, not schema validity:
 * DTD / XSD / RelaxNG are a different job and are not done here.
 *
 * XMLSerializer is not used for the pretty-printed form. It does not indent,
 * it rewrites empty elements, and it disagrees with itself across browsers.
 * Walking the tree and writing the tags keeps the output stable enough to
 * test, and leaves mixed content (an element with both text and children)
 * untouched — pretty-printing that would change the document's meaning.
 */

export class XmlError extends Error {
  readonly detail?: string;

  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'XmlError';
    this.detail = detail;
  }
}

function requireParser(): DOMParser {
  if (typeof DOMParser === 'undefined') {
    throw new XmlError('This environment has no DOMParser, so XML cannot be checked here.');
  }
  return new DOMParser();
}

/** The parsererror element the browser inserts into a failed parse. */
function parserError(doc: Document): Element | undefined {
  const root = doc.documentElement;
  if (root === null) return undefined;
  if (root.localName === 'parsererror') return root;
  const nested = root.getElementsByTagName('parsererror')[0];
  if (nested !== undefined) return nested;
  const ns = doc.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parsererror')[0];
  return ns;
}

function errorText(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text === '' ? 'The document is not well-formed XML.' : text;
}

export function parseXml(text: string): Document {
  const doc = requireParser().parseFromString(text, 'application/xml');
  const error = parserError(doc);
  if (error !== undefined) {
    throw new XmlError('Not well-formed XML.', errorText(error));
  }
  return doc;
}

export function validateXml(text: string): { ok: true } | { ok: false; error: XmlError } {
  try {
    parseXml(text);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof XmlError ? error : new XmlError(error instanceof Error ? error.message : String(error)),
    };
  }
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attributes(el: Element): string {
  const attrs = el.attributes;
  let out = '';
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]!;
    out += ` ${attr.name}="${escapeAttr(attr.value)}"`;
  }
  return out;
}

function isIgnorableWhitespace(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() === '';
}

function significantChildren(el: Element): Node[] {
  const out: Node[] = [];
  for (const child of Array.from(el.childNodes)) {
    if (!isIgnorableWhitespace(child)) out.push(child);
  }
  return out;
}

function hasElementChild(nodes: readonly Node[]): boolean {
  return nodes.some((node) => node.nodeType === Node.ELEMENT_NODE);
}

function hasTextualChild(nodes: readonly Node[]): boolean {
  return nodes.some(
    (node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE,
  );
}

function serializeInline(node: Node, stripComments: boolean): string {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      return serializeElement(node as Element, '', 0, { pretty: false, stripComments });
    case Node.TEXT_NODE:
      return escapeText(node.textContent ?? '');
    case Node.CDATA_SECTION_NODE:
      return `<![CDATA[${(node as CDATASection).data}]]>`;
    case Node.COMMENT_NODE:
      return stripComments ? '' : `<!--${(node as Comment).data}-->`;
    case Node.PROCESSING_INSTRUCTION_NODE: {
      const pi = node as ProcessingInstruction;
      return `<?${pi.target}${pi.data === '' ? '' : ` ${pi.data}`}?>`;
    }
    default:
      return '';
  }
}

function serializeElement(
  el: Element,
  indent: string,
  depth: number,
  options: { pretty: boolean; stripComments: boolean },
): string {
  const name = el.tagName;
  const attrs = attributes(el);
  // Whitespace-only text between elements is not data. Drop it in both
  // directions so minify is not a pretty-print with the newlines left in.
  const kids = significantChildren(el);
  const prefix = options.pretty ? indent.repeat(depth) : '';

  if (kids.length === 0) return `${prefix}<${name}${attrs}/>`;

  const mixed = options.pretty && hasElementChild(kids) && hasTextualChild(kids);
  if (!options.pretty || mixed || !hasElementChild(kids)) {
    const inner = kids.map((child) => serializeInline(child, options.stripComments)).join('');
    return `${prefix}<${name}${attrs}>${inner}</${name}>`;
  }

  const inner = kids
    .map((child) => serializeNode(child, indent, depth + 1, options))
    .filter((chunk) => chunk !== '')
    .join('\n');
  return `${prefix}<${name}${attrs}>\n${inner}\n${prefix}</${name}>`;
}

function serializeNode(
  node: Node,
  indent: string,
  depth: number,
  options: { pretty: boolean; stripComments: boolean },
): string {
  const prefix = options.pretty ? indent.repeat(depth) : '';
  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
      return serializeElement(node as Element, indent, depth, options);
    case Node.TEXT_NODE: {
      const text = options.pretty ? (node.textContent ?? '').trim() : (node.textContent ?? '');
      return text === '' ? '' : `${prefix}${escapeText(text)}`;
    }
    case Node.CDATA_SECTION_NODE:
      return `${prefix}<![CDATA[${(node as CDATASection).data}]]>`;
    case Node.COMMENT_NODE:
      return options.stripComments ? '' : `${prefix}<!--${(node as Comment).data}-->`;
    case Node.PROCESSING_INSTRUCTION_NODE: {
      const pi = node as ProcessingInstruction;
      return `${prefix}<?${pi.target}${pi.data === '' ? '' : ` ${pi.data}`}?>`;
    }
    case Node.DOCUMENT_TYPE_NODE: {
      const dt = node as DocumentType;
      const ids = `${dt.publicId !== '' ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId !== '' ? ` "${dt.systemId}"` : ''}`;
      return `${prefix}<!DOCTYPE ${dt.name}${ids}>`;
    }
    default:
      return '';
  }
}

function xmlDeclaration(source: string): string | undefined {
  const match = /^\s*(<\?xml\b[^?]*\?>)/.exec(source);
  return match?.[1];
}

function serializeDocument(
  source: string,
  options: { pretty: boolean; indent: string; stripComments: boolean },
): string {
  const doc = parseXml(source);
  const parts: string[] = [];
  const declaration = xmlDeclaration(source);
  if (declaration !== undefined) parts.push(declaration);

  for (const child of Array.from(doc.childNodes)) {
    const chunk = serializeNode(child, options.indent, 0, options);
    if (chunk !== '') parts.push(chunk);
  }

  return options.pretty ? parts.join('\n') : parts.join('');
}

export function formatXml(text: string, indent: '2' | '4' | 'tab' = '2'): string {
  const unit = indent === 'tab' ? '\t' : indent === '4' ? '    ' : '  ';
  return serializeDocument(text, { pretty: true, indent: unit, stripComments: false });
}

export function minifyXml(text: string, stripComments = false): string {
  return serializeDocument(text, { pretty: false, indent: '', stripComments });
}
