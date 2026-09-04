/**
 * Hex dumps: the view of a file where every byte is visible.
 *
 * A digest tells you whether two files are the same; it cannot tell you what
 * is at offset 0x40, or that a file starts with a UTF-8 byte-order mark. The
 * layout here is the one `hexdump -C` produces, because it is the one people
 * already read: offset, sixteen bytes, then the printable ones.
 *
 * Offsets are absolute, which matters on the file page: pages are read
 * separately with `slice()`, so the offset shown for byte 0 of a page has to
 * be that byte's offset in the file, not in the chunk.
 */

export interface HexDumpOptions {
  /** Bytes per line: 8, 16 or 32. Sixteen is what `hexdump -C` uses. */
  readonly bytesPerLine: number;
  readonly uppercase: boolean;
  readonly showOffset: boolean;
  readonly showAscii: boolean;
  /** Offsets in hexadecimal, the way every hex editor shows them, or decimal. */
  readonly offsetBase: 'hex' | 'decimal';
  /**
   * Offset of the first byte, for a window into something bigger.
   *
   * The file page reads one page at a time with slice(), and a page is not
   * the beginning of the file. Without this, every page would claim to start
   * at zero, which is worse than useless when the point is to find where
   * something is.
   */
  readonly baseOffset?: number;
}

export const DEFAULT_HEXDUMP_OPTIONS: HexDumpOptions = {
  bytesPerLine: 16,
  uppercase: false,
  showOffset: true,
  showAscii: true,
  offsetBase: 'hex',
  baseOffset: 0,
};

/** Bytes per group within a line. `hexdump -C` splits sixteen into two eights. */
const GROUP = 8;

/**
 * Which characters get shown as themselves in the right-hand column.
 *
 * Everything outside printable ASCII becomes a dot, including the top half of
 * Latin-1 and every byte of a UTF-8 sequence: showing one byte of a multi-byte
 * character as a letter is a lie about what is there.
 */
function asciiOf(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.';
}

function offsetLabel(offset: number, options: HexDumpOptions, width: number): string {
  if (!options.showOffset) return '';
  const text =
    options.offsetBase === 'hex' ? offset.toString(16) : offset.toString(10);
  const padded = text.padStart(width, options.offsetBase === 'hex' ? '0' : ' ');
  return (options.uppercase ? padded.toUpperCase() : padded) + '  ';
}

/**
 * Width of the offset column, so that offsets line up under each other.
 *
 * Eight hexadecimal digits is what `hexdump -C` uses and covers 4 GiB; the
 * decimal form is aligned to the widest offset the data actually reaches
 * rather than padded to a fixed width, because decimal offsets get long
 * quickly and would dominate the line.
 */
function offsetWidth(total: number, options: HexDumpOptions): number {
  if (options.offsetBase === 'hex') return 8;
  return Math.max(1, String(Math.max(total, options.bytesPerLine)).length);
}

export function hexDumpLines(
  bytes: Uint8Array,
  options: HexDumpOptions = DEFAULT_HEXDUMP_OPTIONS,
): string[] {
  const perLine = Math.max(1, Math.floor(options.bytesPerLine));
  const base = options.baseOffset ?? 0;
  const width = offsetWidth(base + bytes.length, options);
  // Three characters per byte -- two digits and a space -- plus one extra
  // space between groups, which is what makes a line scannable.
  const hexWidth = perLine * 3 + Math.ceil(perLine / GROUP) - 2;

  const lines: string[] = [];
  // An empty input has no line to show, not a line of padding.
  if (bytes.length === 0) return lines;

  for (let line = 0; line * perLine < bytes.length; line++) {
    const start = line * perLine;
    const chunk = bytes.subarray(start, Math.min(start + perLine, bytes.length));
    const offset = base + start;

    let hex = '';
    for (let i = 0; i < perLine; i++) {
      if (i > 0) hex += i % GROUP === 0 ? '  ' : ' ';
      hex += i < chunk.length ? (chunk[i]!.toString(16).padStart(2, '0')) : '  ';
    }
    if (options.uppercase) hex = hex.toUpperCase();

    // Padded only when there is something to the right of it: without an
    // ASCII column, trailing spaces are invisible and pointless.
    let out =
      offsetLabel(offset, options, width) +
      // Without an ASCII column the row-wide padding has nothing to align
      // with, so it is trimmed rather than left as trailing whitespace.
      (options.showAscii ? hex.padEnd(hexWidth) : hex.replace(/\s+$/, ''));
    if (options.showAscii) {
      // Not padded: a short last line shows only the bytes it has.
      out += '  |' + Array.from(chunk, asciiOf).join('') + '|';
    }
    lines.push(out);
  }

  return lines;
}

/** The whole dump as one string, with a trailing newline like `hexdump -C`. */
export function hexDump(
  bytes: Uint8Array,
  options: HexDumpOptions = DEFAULT_HEXDUMP_OPTIONS,
): string {
  const lines = hexDumpLines(bytes, options);
  return lines.length === 0 ? '' : lines.join('\n') + '\n';
}
