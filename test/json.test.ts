/**
 * JSON: parse, format, minify, structural compare.
 *
 * The parser is JSON.parse, so the oracle is the platform. What is checked
 * here is the reading of a failure, that pretty-print does not change values,
 * and that a structural diff treats object key order as irrelevant.
 */
import { describe, expect, it } from 'vitest';
import {
  diffJson,
  formatJson,
  jsonTree,
  minifyJson,
  offsetToLineCol,
  parseJson,
  snippetAt,
  sortKeys,
} from '~/lib/json';
import { repairJson } from '~/lib/json-repair';

describe('parseJson', () => {
  it('accepts every RFC 8259 value kind', () => {
    expect(parseJson('null')).toEqual({ ok: true, value: null });
    expect(parseJson('true')).toEqual({ ok: true, value: true });
    expect(parseJson('false')).toEqual({ ok: true, value: false });
    expect(parseJson('0')).toEqual({ ok: true, value: 0 });
    expect(parseJson('"hi"')).toEqual({ ok: true, value: 'hi' });
    expect(parseJson('[]')).toEqual({ ok: true, value: [] });
    expect(parseJson('{}')).toEqual({ ok: true, value: {} });
  });

  it('keeps object key insertion order, which is what JSON.parse does', () => {
    const parsed = parseJson('{"b":1,"a":2}');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(Object.keys(parsed.value as object)).toEqual(['b', 'a']);
  });

  it('names a line and column for a trailing comma', () => {
    const parsed = parseJson('{"a": 1,}');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.message).toMatch(/Not valid JSON/);
    expect(parsed.error.line).toBeDefined();
    expect(parsed.error.column).toBeDefined();
    expect(parsed.error.snippet).toMatch(/\^/);
  });

  it('points at the extra character after a complete value', () => {
    const parsed = parseJson('true true');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.position).toBeGreaterThan(4);
  });
});

describe('offsetToLineCol and snippetAt', () => {
  it('treats the first character as line 1, column 1', () => {
    expect(offsetToLineCol('abc', 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineCol('abc', 2)).toEqual({ line: 1, column: 3 });
  });

  it('counts newlines', () => {
    expect(offsetToLineCol('a\nbc', 2)).toEqual({ line: 2, column: 1 });
  });

  it('draws a caret under the named column', () => {
    const snippet = snippetAt('{"a": 1,}', 8);
    expect(snippet).toMatch(/{"a": 1,}/);
    expect(snippet).toMatch(/\^/);
  });
});

describe('format and minify, against JSON.stringify', () => {
  const samples = [
    'null',
    '[]',
    '{}',
    '{"a":1,"b":[true,false,null,"x"]}',
    '{"nested":{"k":"v"}}',
    '"quote \\" and \\\\ slash"',
  ];

  it.each(samples)('pretty-print of %s round-trips through JSON.parse', (input) => {
    const pretty = formatJson(input, { indent: 2 });
    expect(JSON.parse(pretty)).toEqual(JSON.parse(input));
    expect(pretty).toBe(JSON.stringify(JSON.parse(input), null, 2));
  });

  it.each(samples)('minify of %s is JSON.stringify with no space', (input) => {
    expect(minifyJson(input)).toBe(JSON.stringify(JSON.parse(input)));
  });

  it('sorts keys when asked, including nested objects', () => {
    const pretty = formatJson('{"b":{"d":1,"c":2},"a":0}', { indent: 2, sortKeys: true });
    expect(pretty).toBe(JSON.stringify(sortKeys({ b: { d: 1, c: 2 }, a: 0 }), null, 2));
    expect(pretty.startsWith('{\n  "a"')).toBe(true);
  });

  it('uses a tab when that is the indent', () => {
    expect(formatJson('{"a":1}', { indent: '\t' })).toBe('{\n\t"a": 1\n}');
  });
});

describe('jsonTree', () => {
  it('labels types and lengths', () => {
    const tree = jsonTree({ a: [1, 'x'], b: null, c: false });
    expect(tree.type).toBe('object');
    expect(tree.length).toBe(3);
    const a = tree.children?.find((c) => c.key === 'a')?.node;
    expect(a?.type).toBe('array');
    expect(a?.length).toBe(2);
  });
});

describe('diffJson', () => {
  it('treats key order as irrelevant', () => {
    expect(diffJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });

  it('reports added, removed and changed paths', () => {
    const diffs = diffJson({ a: 1, b: 2, c: [0] }, { a: 1, b: 3, c: [0, 1], d: true });
    expect(diffs).toEqual(
      expect.arrayContaining([
        { kind: 'changed', path: '$.b', from: 2, to: 3 },
        { kind: 'added', path: '$.c[1]', value: 1 },
        { kind: 'added', path: '$.d', value: true },
      ]),
    );
  });

  it('does not treat array order as irrelevant', () => {
    expect(diffJson([1, 2], [2, 1])).toEqual([
      { kind: 'changed', path: '$[0]', from: 1, to: 2 },
      { kind: 'changed', path: '$[1]', from: 2, to: 1 },
    ]);
  });
});

describe('repairJson', () => {
  it('quotes keys and swaps single quotes, then JSON.parse accepts the result', () => {
    const result = repairJson("{name: 'Ada'}");
    expect(result.alreadyValid).toBe(false);
    expect(JSON.parse(result.repaired)).toEqual({ name: 'Ada' });
    expect(JSON.parse(result.formatted)).toEqual({ name: 'Ada' });
  });

  it('strips trailing commas and comments', () => {
    const result = repairJson('{ "a": 1, /* keep the value */ }');
    expect(JSON.parse(result.repaired)).toEqual({ a: 1 });
  });

  it('translates Python True / False / None', () => {
    const result = repairJson('{"ok": True, "n": None, "no": False}');
    expect(JSON.parse(result.repaired)).toEqual({ ok: true, n: null, no: false });
  });

  it('leaves valid JSON alone, aside from formatting', () => {
    const result = repairJson('{"a": 1}');
    expect(result.alreadyValid).toBe(true);
    expect(JSON.parse(result.formatted)).toEqual({ a: 1 });
  });
});
