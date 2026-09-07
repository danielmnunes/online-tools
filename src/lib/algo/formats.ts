/**
 * Metadata for the format tools.
 *
 * Same contract as codecs.ts: this table is read at build time by the registry
 * and at run time by the widget, and imports no implementation. What it
 * declares is the *shape of the page* — one textarea or two, a tree or a
 * diff, which controls appear. FormatTool.svelte has no `if (id === 'json')`.
 *
 * JSON and XML share a widget because they are the same job to the person
 * using them: paste a document, be told whether it is well-formed, and get it
 * back prettier or smaller. Text compare and syntax highlighting are the
 * same widget too, with a different `kind`.
 */

export type FormatId =
  | 'json-validator'
  | 'json-minifier'
  | 'json-formatter'
  | 'json-viewer'
  | 'json-compare'
  | 'json-repair'
  | 'xml-validator'
  | 'xml-minifier'
  | 'xml-formatter'
  | 'text-compare'
  | 'syntax-highlight';

/**
 * Which layout the widget renders.
 *
 * `validate` is a verdict. `transform` is input → output. `view` is a tree.
 * `compare` is two inputs and a diff. `highlight` is input plus a language.
 */
export type FormatKind = 'validate' | 'transform' | 'view' | 'compare' | 'highlight';

export type FormatFamily = 'json' | 'xml' | 'text';

/**
 * Extra module the page loads, if any.
 *
 * Repair and highlighting are the two operations that pull in a library the
 * other nine pages have no use for. Declaring the chunk here is what keeps
 * `/xml/validator/` from downloading highlight.js.
 */
export type FormatChunk = 'repair' | 'highlight';

export interface FormatOption {
  readonly value: string;
  readonly label: string;
}

export interface FormatControl {
  readonly id: string;
  readonly label: string;
  readonly options: ReadonlyArray<FormatOption>;
  readonly default: string;
  readonly hint?: string;
}

export interface FormatMeta {
  readonly id: FormatId;
  /** URL path without surrounding slashes. */
  readonly slug: string;
  readonly name: string;
  readonly title: string;
  readonly family: FormatFamily;
  readonly kind: FormatKind;
  /**
   * For `transform` pages: pretty-print or strip whitespace. The widget
   * branches on this, not on the id, so JSON and XML share the same arms.
   */
  readonly op?: 'format' | 'minify';
  readonly chunk?: FormatChunk;
  readonly keywords: ReadonlyArray<string>;
  readonly related: ReadonlyArray<string>;
  readonly controls: ReadonlyArray<FormatControl>;
  readonly blurb: string;
  /** Placeholder on the (first) textarea. */
  readonly placeholder: string;
}

const INDENT: FormatControl = {
  id: 'indent',
  label: 'Indent',
  options: [
    { value: '2', label: '2 spaces' },
    { value: '4', label: '4 spaces' },
    { value: 'tab', label: 'Tab' },
  ],
  default: '2',
  hint: 'Whitespace outside strings. Nothing inside a quoted value moves.',
};

const SORT_KEYS: FormatControl = {
  id: 'sortKeys',
  label: 'Object keys',
  options: [
    { value: 'keep', label: 'Keep order' },
    { value: 'sort', label: 'Sort alphabetically' },
  ],
  default: 'keep',
  hint: 'JSON objects are unordered in the spec; sorting makes two dumps of the same data compare equal as text.',
};

const STRIP_COMMENTS: FormatControl = {
  id: 'comments',
  label: 'Comments',
  options: [
    { value: 'keep', label: 'Keep' },
    { value: 'strip', label: 'Strip' },
  ],
  default: 'keep',
};

const LANGUAGES: FormatControl = {
  id: 'language',
  label: 'Language',
  options: [
    { value: 'auto', label: 'Detect' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'json', label: 'JSON' },
    { value: 'xml', label: 'XML' },
    { value: 'css', label: 'CSS' },
    { value: 'python', label: 'Python' },
    { value: 'sql', label: 'SQL' },
    { value: 'bash', label: 'Bash' },
    { value: 'yaml', label: 'YAML' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
  ],
  default: 'auto',
};

export const FORMATS: Readonly<Record<FormatId, FormatMeta>> = {
  'json-validator': {
    id: 'json-validator',
    slug: 'json/validator',
    name: 'JSON validator',
    title: 'JSON Validator',
    family: 'json',
    kind: 'validate',
    keywords: ['json validator', 'validate json', 'json lint', 'rfc 8259'],
    related: ['json/formatter', 'json/repair', 'json/minifier'],
    controls: [],
    blurb: 'JSON.parse is the same parser the rest of the platform will use. A pass here is a pass there.',
    placeholder: '{ "ok": true }',
  },
  'json-minifier': {
    id: 'json-minifier',
    slug: 'json/minifier',
    name: 'JSON minifier',
    title: 'JSON Minifier',
    family: 'json',
    kind: 'transform',
    op: 'minify',
    keywords: ['json minify', 'json compress', 'remove whitespace json'],
    related: ['json/formatter', 'json/validator', 'json/repair'],
    controls: [SORT_KEYS],
    blurb: 'One line. The values do not change; only the whitespace between them goes.',
    placeholder: '{\n  "ok": true\n}',
  },
  'json-formatter': {
    id: 'json-formatter',
    slug: 'json/formatter',
    name: 'JSON formatter',
    title: 'JSON Formatter',
    family: 'json',
    kind: 'transform',
    op: 'format',
    keywords: ['json formatter', 'json pretty print', 'beautify json'],
    related: ['json/minifier', 'json/validator', 'json/viewer', 'json/repair'],
    controls: [INDENT, SORT_KEYS],
    blurb: 'Pretty-print. Indentation is the only thing that changes, and never inside a string.',
    placeholder: '{"ok":true,"items":[1,2,3]}',
  },
  'json-viewer': {
    id: 'json-viewer',
    slug: 'json/viewer',
    name: 'JSON viewer',
    title: 'JSON Viewer',
    family: 'json',
    kind: 'view',
    keywords: ['json viewer', 'json tree', 'inspect json'],
    related: ['json/formatter', 'json/validator', 'cbor'],
    controls: [],
    blurb: 'A collapsible tree of the same values JSON.parse produces, with types visible.',
    placeholder: '{\n  "user": { "id": 1, "roles": ["admin"] },\n  "ok": true\n}',
  },
  'json-compare': {
    id: 'json-compare',
    slug: 'json/compare',
    name: 'JSON compare',
    title: 'JSON Compare',
    family: 'json',
    kind: 'compare',
    keywords: ['json compare', 'json diff', 'json difference'],
    related: ['json/formatter', 'text-compare', 'json/viewer'],
    controls: [],
    blurb: 'A structural diff: key order does not count, and a moved value is a change at its path.',
    placeholder: '{ "a": 1, "b": 2 }',
  },
  'json-repair': {
    id: 'json-repair',
    slug: 'json/repair',
    name: 'JSON repair',
    title: 'JSON Repair',
    family: 'json',
    kind: 'transform',
    chunk: 'repair',
    keywords: ['json repair', 'fix json', 'trailing comma json', 'json comments'],
    related: ['json/validator', 'json/formatter', 'json/minifier'],
    controls: [INDENT],
    blurb: 'Trailing commas, comments, single quotes, unquoted keys — the mistakes a person makes, not a parser.',
    placeholder: "{name: 'Ada', tags: ['a', 'b',], /* ok */}",
  },
  'xml-validator': {
    id: 'xml-validator',
    slug: 'xml/validator',
    name: 'XML validator',
    title: 'XML Validator',
    family: 'xml',
    kind: 'validate',
    keywords: ['xml validator', 'validate xml', 'well-formed xml'],
    related: ['xml/formatter', 'xml/minifier', 'json/validator'],
    controls: [],
    blurb: 'Well-formedness, via the browser’s own DOMParser. Not a schema check.',
    placeholder: '<?xml version="1.0"?>\n<root ok="true"/>',
  },
  'xml-minifier': {
    id: 'xml-minifier',
    slug: 'xml/minifier',
    name: 'XML minifier',
    title: 'XML Minifier',
    family: 'xml',
    kind: 'transform',
    op: 'minify',
    keywords: ['xml minify', 'xml compress', 'remove whitespace xml'],
    related: ['xml/formatter', 'xml/validator', 'json/minifier'],
    controls: [STRIP_COMMENTS],
    blurb: 'Whitespace between elements goes. Text content stays, because that is data.',
    placeholder: '<root>\n  <item>one</item>\n</root>',
  },
  'xml-formatter': {
    id: 'xml-formatter',
    slug: 'xml/formatter',
    name: 'XML formatter',
    title: 'XML Formatter',
    family: 'xml',
    kind: 'transform',
    op: 'format',
    keywords: ['xml formatter', 'xml pretty print', 'beautify xml'],
    related: ['xml/minifier', 'xml/validator', 'json/formatter'],
    controls: [INDENT],
    blurb: 'Pretty-print, leaving mixed content — an element that has both text and children — alone.',
    placeholder: '<root><item id="1">one</item><item id="2">two</item></root>',
  },
  'text-compare': {
    id: 'text-compare',
    slug: 'text-compare',
    name: 'Text compare',
    title: 'Text Compare',
    family: 'text',
    kind: 'compare',
    keywords: ['text compare', 'diff', 'text diff', 'line diff'],
    related: ['json/compare', 'syntax-highlight'],
    controls: [],
    blurb: 'A line-by-line diff. The algorithm is Myers, the same family `diff` uses.',
    placeholder: 'one\ntwo\nthree',
  },
  'syntax-highlight': {
    id: 'syntax-highlight',
    slug: 'syntax-highlight',
    name: 'Syntax highlight',
    title: 'Syntax Highlighter',
    family: 'text',
    kind: 'highlight',
    chunk: 'highlight',
    keywords: ['syntax highlight', 'code highlighter', 'highlight.js'],
    related: ['json/formatter', 'xml/formatter', 'text-compare'],
    controls: [LANGUAGES],
    blurb: 'Highlighting runs in the browser on a curated set of languages. Nothing is sent anywhere.',
    placeholder: 'function hello(name) {\n  return `hi, ${name}`;\n}',
  },
};

export const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

export function isFormatId(value: string): value is FormatId {
  return Object.hasOwn(FORMATS, value);
}

export function defaultFormatOptions(id: FormatId): Record<string, string> {
  const options: Record<string, string> = {};
  for (const control of FORMATS[id].controls) options[control.id] = control.default;
  return options;
}
