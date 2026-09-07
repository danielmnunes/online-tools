/**
 * Syntax highlighting, behind a dynamic import.
 *
 * highlight.js is loaded only from the syntax-highlight page (see
 * FormatMeta.chunk). The set of languages is curated rather than the full
 * catalogue: each grammar is a few kilobytes, and the point of a page here
 * is that `/json/validator/` does not pay for Rust.
 *
 * highlight.js escapes the source before wrapping tokens in spans, which is
 * what makes `{@html}` on the result safe: the only tags in the output are
 * the ones it inserted.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('python', python);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);

export const HIGHLIGHT_LANGUAGES = [
  'javascript',
  'typescript',
  'json',
  'xml',
  'css',
  'python',
  'sql',
  'bash',
  'yaml',
  'markdown',
  'go',
  'rust',
] as const;

export type HighlightLanguage = (typeof HIGHLIGHT_LANGUAGES)[number];

export interface HighlightResult {
  readonly html: string;
  readonly language: string;
  readonly detected: boolean;
}

export function highlightCode(code: string, language: string): HighlightResult {
  if (code === '') return { html: '', language: language === 'auto' ? '' : language, detected: false };

  if (language !== 'auto') {
    const result = hljs.highlight(code, { language, ignoreIllegals: true });
    return { html: result.value, language: result.language ?? language, detected: false };
  }

  const result = hljs.highlightAuto(code, [...HIGHLIGHT_LANGUAGES]);
  return {
    html: result.value,
    language: result.language ?? '',
    detected: result.language !== undefined,
  };
}
