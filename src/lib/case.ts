/**
 * Case conversion.
 *
 * Lower and upper operate on the whole string: they change letters and leave
 * separators alone, which is what "make this lowercase" means. The other
 * five split into words first — on whitespace, punctuation, and camelCase
 * boundaries — and join them back under the target convention.
 *
 * Word splitting is the part that has to be right. `XMLHttpRequest` is three
 * words (XML, Http, Request), `version2` is two, and a string that is already
 * snake_case should round-trip through camelCase and back.
 */

import type { CaseId } from './algo/converts';

/**
 * Split an identifier into words.
 *
 * Order of operations matters and is the one change-case and similar
 * libraries converged on:
 * 1. a lowercase (or digit) followed by an uppercase is a boundary
 *    (`helloWorld` → hello World);
 * 2. an uppercase run followed by uppercase+lowercase splits before the
 *    last uppercase (`XMLHttp` → XML Http);
 * 3. letters and digits split (`v2Draft` → v 2 Draft);
 * 4. everything else is a separator.
 */
export function words(input: string): string[] {
  const prepared = input
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
  return prepared.split(/[^A-Za-z0-9]+/).filter((part) => part.length > 0);
}

function capitalise(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function convertCase(input: string, target: CaseId): string {
  if (target === 'case-lower') return input.toLowerCase();
  if (target === 'case-upper') return input.toUpperCase();

  const parts = words(input);
  if (parts.length === 0) return '';

  switch (target) {
    case 'case-camel':
      return parts[0]!.toLowerCase() + parts.slice(1).map(capitalise).join('');
    case 'case-pascal':
      return parts.map(capitalise).join('');
    case 'case-snake':
      return parts.map((part) => part.toLowerCase()).join('_');
    case 'case-kebab':
      return parts.map((part) => part.toLowerCase()).join('-');
    case 'case-constant':
      return parts.map((part) => part.toUpperCase()).join('_');
  }
}

/** Every case of the same input, so a page can show the neighbours. */
export function allCases(input: string): Record<CaseId, string> {
  return {
    'case-lower': convertCase(input, 'case-lower'),
    'case-upper': convertCase(input, 'case-upper'),
    'case-camel': convertCase(input, 'case-camel'),
    'case-pascal': convertCase(input, 'case-pascal'),
    'case-snake': convertCase(input, 'case-snake'),
    'case-kebab': convertCase(input, 'case-kebab'),
    'case-constant': convertCase(input, 'case-constant'),
  };
}
