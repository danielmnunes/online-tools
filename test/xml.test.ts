// @vitest-environment jsdom
/**
 * XML: well-formedness, pretty-print, minify.
 *
 * The parser is the browser's DOMParser. Tests run in jsdom because Node has
 * no DOMParser, and jsdom is the closest stand-in the suite already uses.
 */
import { describe, expect, it } from 'vitest';
import { formatXml, minifyXml, parseXml, validateXml } from '~/lib/xml';

const SAMPLE = '<root><item id="1">one</item><item id="2">two</item></root>';

describe('validateXml', () => {
  it('accepts a well-formed document', () => {
    expect(validateXml(SAMPLE).ok).toBe(true);
    expect(validateXml('<root/>').ok).toBe(true);
    expect(validateXml('<?xml version="1.0"?><root/>').ok).toBe(true);
  });

  it('rejects a missing close tag, with the parser\'s own words', () => {
    const result = validateXml('<root><item>');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.detail ?? result.error.message).toMatch(/./);
  });

  it('rejects two root elements', () => {
    expect(validateXml('<a/><b/>').ok).toBe(false);
  });
});

describe('formatXml', () => {
  it('indents element-only trees and keeps the values', () => {
    const pretty = formatXml(SAMPLE);
    expect(pretty).toBe(
      ['<root>', '  <item id="1">one</item>', '  <item id="2">two</item>', '</root>'].join('\n'),
    );
    expect(validateXml(pretty).ok).toBe(true);
  });

  it('leaves mixed content on one line, because pretty-printing it would change the text', () => {
    const pretty = formatXml('<p>Hello <em>there</em></p>');
    expect(pretty).toBe('<p>Hello <em>there</em></p>');
  });

  it('keeps a declaration that was in the input', () => {
    const pretty = formatXml('<?xml version="1.0" encoding="UTF-8"?><root/>');
    expect(pretty.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(pretty).toMatch(/<root\/>/);
  });

  it('keeps comments and CDATA', () => {
    const pretty = formatXml('<root><!--hi--><![CDATA[1 < 2]]></root>');
    expect(pretty).toContain('<!--hi-->');
    expect(pretty).toContain('<![CDATA[1 < 2]]>');
  });

  it('escapes text that would otherwise look like markup', () => {
    const pretty = formatXml('<root>1 &lt; 2</root>');
    expect(pretty).toContain('1 &lt; 2');
    expect(parseXml(pretty).documentElement.textContent).toBe('1 < 2');
  });
});

describe('minifyXml', () => {
  it('strips whitespace between elements and keeps text', () => {
    const min = minifyXml('<root>\n  <item>one</item>\n</root>');
    expect(min).toBe('<root><item>one</item></root>');
  });

  it('strips comments when asked, and only then', () => {
    const withComment = '<root><!--x--><item>one</item></root>';
    expect(minifyXml(withComment, false)).toContain('<!--x-->');
    expect(minifyXml(withComment, true)).toBe('<root><item>one</item></root>');
  });
});
