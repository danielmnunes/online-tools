/**
 * JSON: parse, pretty-print, minify, walk, compare.
 *
 * The parser is the platform's. JSON.parse / JSON.stringify are what every
 * other piece of JavaScript will do with the same text, so they are the
 * right oracle: a document that passes here passes there. What this module
 * adds is the reading of a failure (line, column, a snippet with a caret)
 * and the tree / structural-diff views the widgets show.
 *
 * Repair lives in json-repair.ts and is loaded only on that page, because
 * the library that does it has no business sitting on the validator.
 */
export class JsonError extends Error {
  readonly position?: number;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;

  constructor(message: string, loc: { position?: number; line?: number; column?: number; snippet?: string }) {
    super(message);
    this.name = 'JsonError';
    this.position = loc.position;
    this.line = loc.line;
    this.column = loc.column;
    this.snippet = loc.snippet;
  }
}

export type JsonParseResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: JsonError };

export type JsonIndent = 2 | 4 | '\t';

export function indentFromOption(value: string): JsonIndent {
  if (value === '4') return 4;
  if (value === 'tab') return '\t';
  return 2;
}

/** Line and column, 1-based, of a 0-based offset. */
export function offsetToLineCol(text: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastBreak = i;
    }
  }
  return { line, column: clamped - lastBreak };
}

function lineColToOffset(text: string, line: number, column: number): number {
  let current = 1;
  let i = 0;
  while (i < text.length && current < line) {
    if (text.charCodeAt(i) === 10) current++;
    i++;
  }
  return Math.min(text.length, i + Math.max(0, column - 1));
}

/**
 * The caret view: a couple of lines around the failure, with a pointer.
 *
 * The engine's message names a position; this is what makes that position
 * something a person can look at.
 */
export function snippetAt(text: string, position: number): string {
  const { line } = offsetToLineCol(text, position);
  const lines = text.split('\n');
  const index = Math.max(0, Math.min(line - 1, lines.length - 1));
  const source = lines[index] ?? '';
  const { column } = offsetToLineCol(text, position);
  const pointer = `${' '.repeat(Math.max(0, column - 1))}^`;
  const numbered = `${String(line).padStart(4, ' ')} | ${source}`;
  return `${numbered}\n     | ${pointer}`;
}

function locate(message: string, text: string): { position?: number; line?: number; column?: number } {
  const pos = /(?:at |in JSON at )?position (\d+)/i.exec(message);
  if (pos) {
    const position = Number(pos[1]);
    return { position, ...offsetToLineCol(text, position) };
  }
  const lc = /line (\d+) column (\d+)/i.exec(message);
  if (lc) {
    const line = Number(lc[1]);
    const column = Number(lc[2]);
    return { position: lineColToOffset(text, line, column), line, column };
  }
  return {};
}

export function parseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const loc = locate(raw, text);
    const where =
      loc.line !== undefined && loc.column !== undefined
        ? ` at line ${loc.line}, column ${loc.column}`
        : loc.position !== undefined
          ? ` at position ${loc.position}`
          : '';
    return {
      ok: false,
      error: new JsonError(
        `Not valid JSON${where}. ${raw.replace(/^JSON\.parse: /i, '')}`,
        {
          ...loc,
          snippet: loc.position !== undefined ? snippetAt(text, loc.position) : undefined,
        },
      ),
    };
  }
}

/** Recursively sort object keys so two dumps of the same data compare as text. */
export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function stringifyJson(
  value: unknown,
  options: { indent?: JsonIndent | 0; sortKeys?: boolean } = {},
): string {
  const prepared = options.sortKeys === true ? sortKeys(value) : value;
  const space = options.indent === undefined || options.indent === 0 ? undefined : options.indent;
  return JSON.stringify(prepared, null, space) ?? 'null';
}

export function formatJson(text: string, options: { indent?: JsonIndent; sortKeys?: boolean } = {}): string {
  const parsed = parseJson(text);
  if (!parsed.ok) throw parsed.error;
  return stringifyJson(parsed.value, { indent: options.indent ?? 2, sortKeys: options.sortKeys });
}

export function minifyJson(text: string, options: { sortKeys?: boolean } = {}): string {
  const parsed = parseJson(text);
  if (!parsed.ok) throw parsed.error;
  return stringifyJson(parsed.value, { indent: 0, sortKeys: options.sortKeys });
}

export interface JsonTreeNode {
  readonly type: 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object';
  readonly value?: string | number | boolean | null;
  readonly length?: number;
  readonly children?: ReadonlyArray<{ readonly key: string; readonly node: JsonTreeNode }>;
}

export function jsonTree(value: unknown): JsonTreeNode {
  if (value === null) return { type: 'null', value: null };
  if (typeof value === 'boolean') return { type: 'boolean', value };
  if (typeof value === 'number') return { type: 'number', value };
  if (typeof value === 'string') return { type: 'string', value };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      children: value.map((item, index) => ({ key: String(index), node: jsonTree(item) })),
    };
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: 'object',
      length: entries.length,
      children: entries.map(([key, item]) => ({ key, node: jsonTree(item) })),
    };
  }
  // JSON.parse never produces undefined, bigint or function. stringify them
  // so a caller that built a tree by hand still gets something printable.
  return { type: 'string', value: String(value) };
}

export type JsonDiff =
  | { readonly kind: 'added'; readonly path: string; readonly value: unknown }
  | { readonly kind: 'removed'; readonly path: string; readonly value: unknown }
  | { readonly kind: 'changed'; readonly path: string; readonly from: unknown; readonly to: unknown };

function pathJoin(base: string, key: string): string {
  if (base === '') return key.startsWith('[') ? key : key;
  if (key.startsWith('[')) return `${base}${key}`;
  return `${base}.${key}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Structural comparison of two JSON values.
 *
 * Object key order is ignored: RFC 8259 says members are unordered, so
 * `{"a":1,"b":2}` and `{"b":2,"a":1}` are the same document. Arrays are
 * compared by index, because order there is data.
 */
export function diffJson(left: unknown, right: unknown, path = ''): JsonDiff[] {
  if (Object.is(left, right)) return [];
  if (typeof left !== typeof right || left === null || right === null) {
    return [{ kind: 'changed', path: path || '$', from: left, to: right }];
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return [{ kind: 'changed', path: path || '$', from: left, to: right }];
    }
    const out: JsonDiff[] = [];
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i++) {
      const child = pathJoin(path || '$', `[${i}]`);
      if (i >= left.length) out.push({ kind: 'added', path: child, value: right[i] });
      else if (i >= right.length) out.push({ kind: 'removed', path: child, value: left[i] });
      else out.push(...diffJson(left[i], right[i], child));
    }
    return out;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const out: JsonDiff[] = [];
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      const child = pathJoin(path || '$', key);
      const hasLeft = Object.hasOwn(left, key);
      const hasRight = Object.hasOwn(right, key);
      if (!hasLeft) out.push({ kind: 'added', path: child, value: right[key] });
      else if (!hasRight) out.push({ kind: 'removed', path: child, value: left[key] });
      else out.push(...diffJson(left[key], right[key], child));
    }
    return out;
  }
  return [{ kind: 'changed', path: path || '$', from: left, to: right }];
}

export function previewJson(value: unknown, limit = 80): string {
  const text = JSON.stringify(value);
  if (text === undefined) return 'undefined';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}
