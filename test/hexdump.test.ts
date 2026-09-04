/**
 * Hex dumps.
 *
 * The layout is checked against a transcribed `hexdump -C` line -- offset,
 * sixteen bytes split into two groups of eight, then the printable ones -- and
 * then, where the machine running the tests has `hexdump`, against the real
 * thing. That second check is skipped rather than failed where it does not
 * exist, because the output above it is the same either way.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HEXDUMP_OPTIONS,
  hexDump,
  hexDumpLines,
  type HexDumpOptions,
} from '~/lib/hexdump';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function withOptions(overrides: Partial<HexDumpOptions>): HexDumpOptions {
  return { ...DEFAULT_HEXDUMP_OPTIONS, ...overrides };
}

function hasHexdump(): boolean {
  try {
    execFileSync('sh', ['-c', 'command -v hexdump'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('the layout', () => {
  it('matches hexdump -C line for line', () => {
    // Transcribed from `printf 'Hello, world!\n' | hexdump -C`.
    expect(hexDump(utf8('Hello, world!\n')).trimEnd()).toBe(
      '00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21 0a        |Hello, world!.|',
    );
  });

  it('starts the second line at the sixteenth byte', () => {
    const lines = hexDumpLines(new Uint8Array(20).map((_, i) => i));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^00000000  00 01 02 03 04 05 06 07  08 09 0a 0b 0c 0d 0e 0f /);
    expect(lines[1]).toMatch(/^00000010  10 11 12 13 {2,}\|/);
    expect(lines[1]).toContain('|....|');
  });

  it('aligns the ASCII column even when the last line is short', () => {
    const lines = hexDumpLines(utf8('ab'));
    // The bar is in the same column as on a full line, so the columns read
    // as columns rather than as a ragged right edge.
    expect(lines[0]!.indexOf('|')).toBe(60);
    expect(lines[0]!.startsWith('00000000  61 62 ')).toBe(true);
    expect(lines[0]!.trimEnd().endsWith('|ab|')).toBe(true);
  });

  it('shows a dot for everything that is not printable ASCII', () => {
    // A UTF-8 euro sign, a tab, and a byte that is not ASCII at all.
    const dump = hexDumpLines(new Uint8Array([0xe2, 0x82, 0xac, 0x09, 0xc3, 0xa9, 0xff]))[0]!;
    expect(dump).toContain('|.......|');
    // The bytes are all there: showing one of them as a letter would be a lie
    // about what is in the file.
    expect(dump).toContain('e2 82 ac 09 c3 a9 ff');
  });

  it('has nothing to say about an empty input', () => {
    expect(hexDumpLines(new Uint8Array(0))).toEqual([]);
    expect(hexDump(new Uint8Array(0))).toBe('');
  });
});

describe('the options', () => {
  it('writes uppercase hex when asked', () => {
    expect(hexDumpLines(utf8('ab'), withOptions({ uppercase: true }))[0]).toContain('61 62');
    expect(hexDumpLines(new Uint8Array([0xea]), withOptions({ uppercase: true }))[0]).toContain('EA');
  });

  it('drops the offset column and the ASCII column when told to', () => {
    const bare = hexDumpLines(utf8('ab'), withOptions({ showOffset: false, showAscii: false }))[0];
    expect(bare).toBe('61 62');
  });

  it('counts offsets in decimal when asked', () => {
    const bytes = new Uint8Array(40).map((_, i) => i);
    const lines = hexDumpLines(bytes, withOptions({ offsetBase: 'decimal' }));
    expect(lines[1]).toMatch(/^16 /);
  });

  it('fits eight or thirty-two bytes to a line', () => {
    const bytes = new Uint8Array(32).map((_, i) => i);
    expect(hexDumpLines(bytes, withOptions({ bytesPerLine: 8 }))).toHaveLength(4);
    expect(hexDumpLines(bytes, withOptions({ bytesPerLine: 32 }))).toHaveLength(1);
    // Thirty-two bytes split into four groups of eight, not two of sixteen.
    expect(hexDumpLines(bytes, withOptions({ bytesPerLine: 32 }))[0]).toContain(' 08 ');
  });

  it('labels a window into a file with the offset it has in the file', () => {
    // The file page reads one page at a time with slice(), and a page is not
    // the beginning of the file.
    const bytes = new Uint8Array(0x1000 + 16).map((_, i) => i % 251);
    const page = bytes.subarray(0x1000);
    const lines = hexDumpLines(page, withOptions({ baseOffset: 0x1000 }));
    expect(lines[0]!.startsWith('00001000')).toBe(true);
    // And the same page read on its own starts where it starts.
    expect(hexDumpLines(page)[0]!.startsWith('00000000')).toBe(true);
  });
});

describe('against hexdump itself', () => {
  it('produces the same bytes the command produces', () => {
    if (!hasHexdump()) return; // The transcribed line above still holds.

    const bytes = new Uint8Array(1000).map((_, i) => (i * 7 + 3) % 256);
    const dir = mkdtempSync(join(tmpdir(), 'hexdump-'));
    const path = join(dir, 'sample.bin');
    writeFileSync(path, bytes);

    const theirs = execFileSync('hexdump', ['-C', path], { encoding: 'utf8' })
      .split('\n')
      // The command ends with a line holding the final offset and nothing
      // else; this tool has no use for it.
      .filter((line) => line.trim() !== '' && !/^[0-9a-f]{8}$/.test(line.trim()))
      .join('\n');

    expect(hexDump(bytes).trimEnd()).toBe(theirs);
  });
});
