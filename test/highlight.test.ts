/**
 * Syntax highlighting, isolated because highlight.js is a real import.
 */
import { describe, expect, it } from 'vitest';
import { highlightCode } from '~/lib/highlight';

describe('highlightCode', () => {
  it('wraps a JavaScript keyword', () => {
    const result = highlightCode('const x = 1;', 'javascript');
    expect(result.language).toBe('javascript');
    expect(result.html).toMatch(/hljs-keyword/);
    expect(result.html).toContain('const');
  });

  it('detects JSON when asked to auto-detect', () => {
    const result = highlightCode('{"ok": true}', 'auto');
    expect(result.detected).toBe(true);
    expect(result.language).toMatch(/json|javascript/);
  });

  it('escapes markup in the source so the HTML is safe to render', () => {
    const result = highlightCode('<script>alert(1)</script>', 'xml');
    expect(result.html).not.toMatch(/<script>/);
    expect(result.html).toMatch(/&lt;/);
    expect(result.html).toMatch(/&gt;/);
  });
});
