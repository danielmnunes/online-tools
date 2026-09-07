/**
 * Line diff (Myers) and case conversion.
 */
import { describe, expect, it } from 'vitest';
import { diffLines } from '~/lib/diff';
import { allCases, convertCase, words } from '~/lib/case';
import { formatTime, parseTime, unitForNumber } from '~/lib/time';

describe('diffLines', () => {
  it('reports nothing for identical input', () => {
    const diff = diffLines('a\nb\nc', 'a\nb\nc');
    expect(diff.added).toBe(0);
    expect(diff.removed).toBe(0);
    expect(diff.lines.map((l) => l.kind)).toEqual(['equal', 'equal', 'equal']);
  });

  it('sees a trailing newline as an extra empty line', () => {
    const diff = diffLines('a', 'a\n');
    expect(diff.added).toBe(1);
    expect(diff.lines.at(-1)).toMatchObject({ kind: 'add', text: '' });
  });

  it('handles the classic ABCABBA / CBABAC pair', () => {
    const diff = diffLines('A\nB\nC\nA\nB\nB\nA', 'C\nB\nA\nB\nA\nC');
    const replay = (side: 'left' | 'right'): string =>
      diff.lines
        .filter((line) => (side === 'left' ? line.kind !== 'add' : line.kind !== 'remove'))
        .map((line) => line.text)
        .join('\n');
    expect(replay('left')).toBe('A\nB\nC\nA\nB\nB\nA');
    expect(replay('right')).toBe('C\nB\nA\nB\nA\nC');
  });

  it('replays both sides of a one-line change', () => {
    const diff = diffLines('keep\nold\nkeep', 'keep\nnew\nkeep');
    expect(diff.removed).toBe(1);
    expect(diff.added).toBe(1);
    expect(diff.lines.filter((l) => l.kind === 'remove')[0]?.text).toBe('old');
    expect(diff.lines.filter((l) => l.kind === 'add')[0]?.text).toBe('new');
  });

  it('treats empty vs content as all additions', () => {
    const diff = diffLines('', 'x\ny');
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(1);
  });
});

describe('words', () => {
  it('splits camelCase, acronyms, digits and separators', () => {
    expect(words('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(words('helloWorld')).toEqual(['hello', 'World']);
    expect(words('hello_world')).toEqual(['hello', 'world']);
    expect(words('hello-world')).toEqual(['hello', 'world']);
    expect(words('v2Draft')).toEqual(['v', '2', 'Draft']);
    expect(words('version2')).toEqual(['version', '2']);
  });
});

describe('convertCase', () => {
  it('lower and upper leave separators in place', () => {
    expect(convertCase('Hello World', 'case-lower')).toBe('hello world');
    expect(convertCase('Hello World', 'case-upper')).toBe('HELLO WORLD');
  });

  it('joins the same words under each convention', () => {
    expect(convertCase('hello_world', 'case-camel')).toBe('helloWorld');
    expect(convertCase('hello_world', 'case-pascal')).toBe('HelloWorld');
    expect(convertCase('HelloWorld', 'case-snake')).toBe('hello_world');
    expect(convertCase('HelloWorld', 'case-kebab')).toBe('hello-world');
    expect(convertCase('HelloWorld', 'case-constant')).toBe('HELLO_WORLD');
  });

  it('round-trips snake → camel → snake', () => {
    const snake = 'xml_http_request';
    expect(convertCase(convertCase(snake, 'case-camel'), 'case-snake')).toBe(snake);
  });

  it('lists every case of the same input', () => {
    const all = allCases('HelloWorld');
    expect(all['case-kebab']).toBe('hello-world');
    expect(all['case-constant']).toBe('HELLO_WORLD');
  });
});

describe('parseTime', () => {
  it('reads Unix seconds for a 10-digit number', () => {
    const parsed = parseTime('1000000000');
    expect(parsed.inputUnit).toBe('s');
    expect(parsed.unixMs).toBe(1_000_000_000_000);
    expect(parsed.date.toISOString()).toBe('2001-09-09T01:46:40.000Z');
  });

  it('reads Unix milliseconds for a 13-digit number', () => {
    const parsed = parseTime('1000000000123');
    expect(parsed.inputUnit).toBe('ms');
    expect(parsed.unixMs).toBe(1_000_000_000_123);
  });

  it('reads ISO 8601 in UTC', () => {
    const parsed = parseTime('2001-09-09T01:46:40Z');
    expect(parsed.unixSeconds).toBe(1_000_000_000);
    expect(parsed.inputUnit).toBe('iso');
  });

  it('formats the RFC 3339 instant as Unix, ISO and RFC 2822', () => {
    const parsed = parseTime('1996-12-19T16:39:57Z');
    const view = formatTime(parsed, parsed.date);
    expect(view.isoUtc).toBe('1996-12-19T16:39:57.000Z');
    expect(view.unixSeconds).toBe(String(Math.trunc(parsed.unixSeconds)));
    expect(view.relative).toBe('now');
    expect(view.rfc2822).toMatch(/Dec 1996/);
  });

  it('refuses text that is not a date', () => {
    expect(() => parseTime('not a date')).toThrow(/Could not read/);
  });

  it('classifies 1e12 as milliseconds', () => {
    expect(unitForNumber(1e12)).toBe('ms');
    expect(unitForNumber(1e9)).toBe('s');
  });
});
