/**
 * Metadata for the convert tools.
 *
 * Seven case converters and a time converter. The case pages are generated
 * from this table because they are the same widget with a different joining
 * rule; the time page is listed here too so ConvertTool.svelte has one
 * lookup rather than a special case in the registry.
 *
 * The seven cases are the ones people search for, matching the catalogue
 * that inspired this site: lower, UPPER, camelCase, PascalCase, snake_case,
 * kebab-case, CONSTANT_CASE. Title Case and Sentence case are not omitted
 * because they are hard — they are omitted because they are not in that
 * seven, and each extra page is a page that has to stay true.
 */

export type ConvertId =
  | 'case-lower'
  | 'case-upper'
  | 'case-camel'
  | 'case-pascal'
  | 'case-snake'
  | 'case-kebab'
  | 'case-constant'
  | 'time';

export type ConvertKind = 'case' | 'time';

export type CaseId = Exclude<ConvertId, 'time'>;

export interface ConvertMeta {
  readonly id: ConvertId;
  readonly slug: string;
  readonly name: string;
  readonly title: string;
  readonly kind: ConvertKind;
  /** The case this page converts *to*. Absent on the time page. */
  readonly case?: CaseId;
  readonly keywords: ReadonlyArray<string>;
  readonly related: ReadonlyArray<string>;
  readonly blurb: string;
  readonly placeholder: string;
}

export const CONVERTS: Readonly<Record<ConvertId, ConvertMeta>> = {
  'case-lower': {
    id: 'case-lower',
    slug: 'case/lower',
    name: 'lower case',
    title: 'Lower Case Converter',
    kind: 'case',
    case: 'case-lower',
    keywords: ['lowercase', 'lower case', 'to lowercase', 'downcase'],
    related: ['case/upper', 'case/camel', 'case/snake'],
    blurb: 'Every character to lowercase. Separators and punctuation stay where they are.',
    placeholder: 'Hello World',
  },
  'case-upper': {
    id: 'case-upper',
    slug: 'case/upper',
    name: 'UPPER CASE',
    title: 'Upper Case Converter',
    kind: 'case',
    case: 'case-upper',
    keywords: ['uppercase', 'upper case', 'to uppercase', 'caps'],
    related: ['case/lower', 'case/constant', 'case/pascal'],
    blurb: 'Every character to uppercase. Unlike CONSTANT_CASE, spaces are not turned into underscores.',
    placeholder: 'Hello World',
  },
  'case-camel': {
    id: 'case-camel',
    slug: 'case/camel',
    name: 'camelCase',
    title: 'camelCase Converter',
    kind: 'case',
    case: 'case-camel',
    keywords: ['camelcase', 'camel case', 'lowerCamelCase', 'dromedary'],
    related: ['case/pascal', 'case/snake', 'case/kebab'],
    blurb: 'Words joined with no separator, the first one lowercase, the rest capitalised.',
    placeholder: 'hello_world',
  },
  'case-pascal': {
    id: 'case-pascal',
    slug: 'case/pascal',
    name: 'PascalCase',
    title: 'PascalCase Converter',
    kind: 'case',
    case: 'case-pascal',
    keywords: ['pascalcase', 'pascal case', 'UpperCamelCase', 'studly'],
    related: ['case/camel', 'case/constant', 'case/snake'],
    blurb: 'Words joined with no separator, every one capitalised. What TypeScript calls a type name.',
    placeholder: 'hello_world',
  },
  'case-snake': {
    id: 'case-snake',
    slug: 'case/snake',
    name: 'snake_case',
    title: 'snake_case Converter',
    kind: 'case',
    case: 'case-snake',
    keywords: ['snakecase', 'snake case', 'underscore case'],
    related: ['case/kebab', 'case/camel', 'case/constant'],
    blurb: 'Words in lowercase, joined with underscores. The convention in Python and in many databases.',
    placeholder: 'HelloWorld',
  },
  'case-kebab': {
    id: 'case-kebab',
    slug: 'case/kebab',
    name: 'kebab-case',
    title: 'kebab-case Converter',
    kind: 'case',
    case: 'case-kebab',
    keywords: ['kebabcase', 'kebab case', 'dash case', 'lisp case', 'slug'],
    related: ['case/snake', 'case/camel', 'case/lower'],
    blurb: 'Words in lowercase, joined with hyphens. The shape of a URL slug and of a CSS class.',
    placeholder: 'HelloWorld',
  },
  'case-constant': {
    id: 'case-constant',
    slug: 'case/constant',
    name: 'CONSTANT_CASE',
    title: 'CONSTANT_CASE Converter',
    kind: 'case',
    case: 'case-constant',
    keywords: ['constant case', 'screaming snake', 'upper snake', 'macro case'],
    related: ['case/snake', 'case/upper', 'case/pascal'],
    blurb: 'Words in uppercase, joined with underscores. What a C macro and an env var look like.',
    placeholder: 'HelloWorld',
  },
  time: {
    id: 'time',
    slug: 'time',
    name: 'Time converter',
    title: 'Unix Time Converter',
    kind: 'time',
    keywords: [
      'unix timestamp',
      'epoch converter',
      'unix time',
      'iso 8601',
      'utc timestamp',
      'milliseconds since epoch',
    ],
    related: ['case/lower', 'jwt'],
    blurb: 'Unix seconds, Unix milliseconds, ISO 8601 and the clock on this machine — all of the same instant.',
    placeholder: '1735689600',
  },
};

export const CONVERT_IDS = Object.keys(CONVERTS) as ConvertId[];

export const CASE_IDS = CONVERT_IDS.filter((id): id is CaseId => id !== 'time');

export function isConvertId(value: string): value is ConvertId {
  return Object.hasOwn(CONVERTS, value);
}
