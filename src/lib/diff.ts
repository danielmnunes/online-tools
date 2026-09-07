/**
 * Line-oriented diff, Myers' algorithm.
 *
 * O((N+M)D) in the length of the two documents and the size of the edit
 * script, which is the same family `diff(1)` uses. A line-by-line view is
 * what a person pasting two files wants; word-level diff inside a changed
 * line is a different tool.
 *
 * Empty documents and a trailing newline are first-class: `"a\n"` and `"a"`
 * differ by one empty line, which is how the Unix tools report it.
 */

export type DiffKind = 'equal' | 'add' | 'remove';

export interface DiffLine {
  readonly kind: DiffKind;
  readonly text: string;
  /** 1-based, undefined on the side that does not have this line. */
  readonly leftLine?: number;
  readonly rightLine?: number;
}

export interface DiffResult {
  readonly lines: ReadonlyArray<DiffLine>;
  readonly added: number;
  readonly removed: number;
}

function backtrack(
  a: readonly string[],
  b: readonly string[],
  trace: ReadonlyArray<Map<number, number>>,
): Array<{ type: 'insert' | 'delete' | 'keep'; line: string }> {
  const ops: Array<{ type: 'insert' | 'delete' | 'keep'; line: string }> = [];
  let x = a.length;
  let y = b.length;

  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d]!;
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && (v.get(k - 1) ?? Number.NEGATIVE_INFINITY) < (v.get(k + 1) ?? Number.NEGATIVE_INFINITY))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: 'keep', line: a[x - 1]! });
      x--;
      y--;
    }
    if (d === 0) break;
    if (x === prevX) {
      ops.push({ type: 'insert', line: b[y - 1]! });
      y--;
    } else {
      ops.push({ type: 'delete', line: a[x - 1]! });
      x--;
    }
  }

  while (x > 0 && y > 0) {
    ops.push({ type: 'keep', line: a[x - 1]! });
    x--;
    y--;
  }
  while (x > 0) {
    ops.push({ type: 'delete', line: a[x - 1]! });
    x--;
  }
  while (y > 0) {
    ops.push({ type: 'insert', line: b[y - 1]! });
    y--;
  }

  ops.reverse();
  return ops;
}

function myers(a: readonly string[], b: readonly string[]): Array<{ type: 'insert' | 'delete' | 'keep'; line: string }> {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  const max = n + m;
  const v = new Map<number, number>();
  v.set(1, 0);
  const trace: Map<number, number>[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) {
        x = v.get(k + 1) ?? 0;
      } else {
        x = (v.get(k - 1) ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) return backtrack(a, b, trace);
    }
  }
  return [];
}

export function diffLines(left: string, right: string): DiffResult {
  const a = left.split('\n');
  const b = right.split('\n');
  const ops = myers(a, b);

  const lines: DiffLine[] = [];
  let leftLine = 1;
  let rightLine = 1;
  let added = 0;
  let removed = 0;

  for (const op of ops) {
    if (op.type === 'keep') {
      lines.push({ kind: 'equal', text: op.line, leftLine, rightLine });
      leftLine++;
      rightLine++;
    } else if (op.type === 'insert') {
      lines.push({ kind: 'add', text: op.line, rightLine });
      rightLine++;
      added++;
    } else {
      lines.push({ kind: 'remove', text: op.line, leftLine });
      leftLine++;
      removed++;
    }
  }

  return { lines, added, removed };
}
