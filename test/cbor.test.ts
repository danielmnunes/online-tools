/**
 * CBOR, against RFC 8949.
 *
 * Appendix A of the RFC is a table of CBOR items with the diagnostic notation
 * each one means, and it is transcribed below: the hex is the specification's,
 * the notation is the specification's, and the test asks whether the decoder
 * agrees. Where the two disagree the RFC wins, so a change here means something
 * was transcribed wrongly rather than that the expectation should be updated.
 *
 * The table is also where indefiniteness lives -- `(_ )` and `[_ ]` -- which is
 * the part of CBOR that has no JSON equivalent and the part most likely to be
 * handled wrongly: an indefinite item is a stream of chunks terminated by a
 * break, and its length is not known until the break is read.
 */
import { describe, expect, it } from 'vitest';
import { decodeCbor, encodeCbor } from '~/lib/cbor';
import { DecodeError } from '~/lib/encoding';

/** RFC 8949 Appendix A: hex, then the diagnostic notation it stands for. */
const VECTORS: ReadonlyArray<readonly [string, string]> = [
  // Unsigned and negative integers.
  ['00', '0'],
  ['01', '1'],
  ['0a', '10'],
  ['17', '23'],
  ['1818', '24'],
  ['1819', '25'],
  ['1864', '100'],
  ['1903e8', '1000'],
  ['1a000f4240', '1000000'],
  ['1b000000e8d4a51000', '1000000000000'],
  ['1bffffffffffffffff', '18446744073709551615'],
  ['c249010000000000000000', "2(h'010000000000000000')"],
  ['3bffffffffffffffff', '-18446744073709551616'],
  ['20', '-1'],
  ['29', '-10'],
  ['3863', '-100'],
  ['3903e7', '-1000'],

  // Floating point, including the three half-precision specials.
  ['f90000', '0.0'],
  ['f98000', '-0.0'],
  ['f93c00', '1.0'],
  ['fb3ff199999999999a', '1.1'],
  ['f93e00', '1.5'],
  ['f97bff', '65504.0'],
  ['fa47c35000', '100000.0'],
  ['fa7f7fffff', '3.4028234663852886e+38'],
  ['fb7e37e43c8800759c', '1.0e+300'],
  ['f90001', '5.960464477539063e-8'],
  ['f90400', '0.00006103515625'],
  ['f9c400', '-4.0'],
  ['fbc010666666666666', '-4.1'],
  ['f97c00', 'Infinity'],
  ['f97e00', 'NaN'],
  ['f9fc00', '-Infinity'],
  // The _2 and _3 suffixes are the specification's own: Infinity, NaN and
  // -Infinity print identically at every width, so the diagnostic notation
  // marks which one it is.
  ['fa7f800000', 'Infinity_2'],
  ['fa7fc00000', 'NaN_2'],
  ['faff800000', '-Infinity_2'],
  ['fb7ff0000000000000', 'Infinity_3'],
  ['fb7ff8000000000000', 'NaN_3'],
  ['fbfff0000000000000', '-Infinity_3'],

  // Simple values.
  ['f4', 'false'],
  ['f5', 'true'],
  ['f6', 'null'],
  ['f7', 'undefined'],
  ['f0', 'simple(16)'],
  ['f8ff', 'simple(255)'],

  // Tagged values.
  ['c074323031332d30332d32315432303a30343a30305a', '0("2013-03-21T20:04:00Z")'],
  ['c11a514b67b0', '1(1363896240)'],
  ['c1fb41d452d9ec200000', '1(1363896240.5)'],
  ['d74401020304', "23(h'01020304')"],
  ['d818456449455446', "24(h'6449455446')"],
  ['d82076687474703a2f2f7777772e6578616d706c652e636f6d', '32("http://www.example.com")'],

  // Byte and text strings.
  ['40', "h''"],
  ['4401020304', "h'01020304'"],
  ['60', '""'],
  ['6161', '"a"'],
  ['6449455446', '"IETF"'],
  ['62225c', '"\\"\\\\"'],
  ['62c3bc', '"ü"'],
  ['63e6b0b4', '"水"'],
  ['64f0908591', '"𐅑"'],

  // Arrays and maps, definite length.
  ['80', '[]'],
  ['83010203', '[1, 2, 3]'],
  ['8301820203820405', '[1, [2, 3], [4, 5]]'],
  [
    '98190102030405060708090a0b0c0d0e0f101112131415161718181819',
    '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]',
  ],
  ['a0', '{}'],
  ['a201020304', '{1: 2, 3: 4}'],
  ['a26161016162820203', '{"a": 1, "b": [2, 3]}'],
  ['826161a161626163', '["a", {"b": "c"}]'],
  ['a56161614161626142616361436164614461656145', '{"a": "A", "b": "B", "c": "C", "d": "D", "e": "E"}'],

  // Indefinite-length items, whose contents arrive as chunks ended by a break.
  ['5f42010243030405ff', "(_ h'0102', h'030405')"],
  ['7f657374726561646d696e67ff', '(_ "strea", "ming")'],
  ['9fff', '[_ ]'],
  ['9f018202039f0405ffff', '[_ 1, [2, 3], [_ 4, 5]]'],
  ['9f01820203820405ff', '[_ 1, [2, 3], [4, 5]]'],
  ['83018202039f0405ff', '[1, [2, 3], [_ 4, 5]]'],
  ['83019f0203ff820405', '[1, [_ 2, 3], [4, 5]]'],
  ['bf61610161629f0203ffff', '{_ "a": 1, "b": [_ 2, 3]}'],
  ['826161bf61626163ff', '["a", {_ "b": "c"}]'],
  ['bf6346756ef563416d7421ff', '{_ "Fun": true, "Amt": -2}'],
];

/**
 * Diagnostic notation with the insignificant differences taken out.
 *
 * Whitespace is layout. A trailing ".0" is how some writers mark a float, and
 * dropping it lets the RFC's "1.0e+300" and a plain "1e+300" compare equal
 * without either being called wrong.
 */
function squashed(text: string): string {
  return text.replace(/\s+/g, '').replace(/\.0+(?=e|$)/g, '');
}

/**
 * Squashed, and with the indefinite-length marker taken out.
 *
 * `(_`, `[_ ` and `{_ ` say how the item was encoded, not what it says, so
 * this is the form to compare when the point is that a value survived a round
 * trip rather than that its bytes did. The `_2` in `Infinity_2` is left alone:
 * it follows a letter, not a bracket.
 */
function meaning(text: string): string {
  return squashed(text).replace(/([[\]{(])_/g, '$1');
}

describe('decoding', () => {
  it('agrees with every vector in RFC 8949 Appendix A', () => {
    for (const [hex, expected] of VECTORS) {
      const view = decodeCbor(hex);
      expect(squashed(view.diagnostic), `${hex} -> ${expected}`).toBe(squashed(expected));
    }
  });

  it('reads the same bytes out of Base64', () => {
    // 0x83 0x01 0x02 0x03 is [1, 2, 3].
    expect(decodeCbor('gwECAw==', 'base64').diagnostic).toContain('1');
    expect(decodeCbor('gwECAw', 'base64').diagnostic).toContain('1');
  });

  it('annotates the bytes, not just the meaning', () => {
    const { annotated } = decodeCbor('a26161016162820203');
    expect(annotated).toContain('Map (Length: 2 pairs)');
    expect(annotated).toContain('UTF8 (Length: 1): "a"');
  });

  it('renders a tag and its contents in the JSON view rather than dropping them', () => {
    const { json } = decodeCbor('d74401020304');
    expect(JSON.parse(json)).toEqual({ tag: '23', value: '01020304' });
  });

  it('renders an integer too wide for JSON as a string rather than rounding it', () => {
    const { diagnostic, json } = decodeCbor('1bffffffffffffffff');
    expect(squashed(diagnostic)).toBe('18446744073709551615');
    expect(JSON.parse(json)).toBe('18446744073709551615');
  });

  it('reports truncated CBOR as a decode failure, not as a value', () => {
    // A map of two pairs with only one of them present.
    expect(() => decodeCbor('a2616101')).toThrow(DecodeError);
  });

  it('reports input that is not the encoding it was told it was', () => {
    expect(() => decodeCbor('zz')).toThrow(DecodeError);
    expect(() => decodeCbor('')).toThrow(/Paste some CBOR/);
  });
});

describe('encoding', () => {
  const ENCODED: ReadonlyArray<readonly [string, string]> = [
    ['0', '00'],
    ['1', '01'],
    ['23', '17'],
    ['24', '1818'],
    ['-1', '20'],
    ['1.1', 'fb3ff199999999999a'],
    ['true', 'f5'],
    ['false', 'f4'],
    ['null', 'f6'],
    ['""', '60'],
    ['"a"', '6161'],
    ['"IETF"', '6449455446'],
    ['[]', '80'],
    ['[1, 2, 3]', '83010203'],
    ['{}', 'a0'],
    ['{"a": 1}', 'a1616101'],
    ['{"a": 1, "b": [2, 3]}', 'a26161016162820203'],
  ];

  it('produces the bytes the RFC gives for the same value', () => {
    for (const [json, expected] of ENCODED) {
      expect(encodeCbor(json).hex, json).toBe(expected);
    }
  });

  /**
   * The vectors JSON can carry there and back.
   *
   * Everything else is left out on purpose, and the reasons are the shape of
   * the formats: JSON has no integer wider than 2^53, no byte string, no map
   * key that is not a string, no tag, no Infinity or NaN, no simple value, and
   * no way to say that a float is a float once it prints as "1".
   */
  const THROUGH_JSON = [
    '00', '01', '0a', '17', '1818', '1864', '1903e8', '1a000f4240', '1b000000e8d4a51000',
    '20', '29', '3863', '3903e7',
    'fb3ff199999999999a', 'f93e00', 'fa47c35000', 'f90001',
    'f4', 'f5', 'f6',
    '60', '6161', '6449455446', '62225c', '62c3bc', '63e6b0b4', '64f0908591',
    '80', '83010203', '8301820203820405',
    '98190102030405060708090a0b0c0d0e0f101112131415161718181819',
    'a0', 'a26161016162820203', '826161a161626163',
    'a56161614161626142616361436164614461656145',
    // Indefinite lengths come back definite, which is a different encoding of
    // the same value rather than a different value.
    '9fff', '9f018202039f0405ffff', '9f01820203820405ff', '83018202039f0405ff',
    '83019f0203ff820405', 'bf61610161629f0203ffff', '826161bf61626163ff',
    'bf6346756ef563416d7421ff',
  ];

  it('encodes what it decodes, and means the same thing afterwards', () => {
    for (const hex of THROUGH_JSON) {
      const view = decodeCbor(hex);
      expect(meaning(diagnoseAgain(encodeCbor(view.json).hex)), hex).toBe(meaning(view.diagnostic));
    }
  });

  it('gives back the same bytes for a definite-length item', () => {
    const definite = THROUGH_JSON.filter(
      // An indefinite item comes back definite, which is a different encoding
      // of the same value. And 100000.0 prints in JSON as 100000, so the way
      // back reads it as an integer: the meaning survives, the bytes do not.
      (item) => !item.includes('ff') && item !== 'fa47c35000',
    );
    for (const hex of definite) {
      expect(encodeCbor(decodeCbor(hex).json).hex, hex).toBe(hex);
    }
  });

  it('sorts map keys only when determinism is asked for', () => {
    const json = '{"b": 1, "a": 2}';
    // Insertion order, then key order: the same data, two sets of bytes, and
    // only one of them is reproducible across encoders.
    expect(encodeCbor(json).hex).toBe('a2616201616102');
    expect(encodeCbor(json, { deterministic: true }).hex).toBe('a2616102616201');
  });

  it('says how much space CBOR saved, which is the point of it', () => {
    const { bytes, jsonSize } = encodeCbor('{"a": 1, "b": [2, 3]}');
    expect(bytes).toHaveLength(9);
    expect(jsonSize).toBe('{"a":1,"b":[2,3]}'.length);
  });

  it('reports JSON that will not parse instead of encoding nothing', () => {
    expect(() => encodeCbor('{"a": }')).toThrow(DecodeError);
    expect(() => encodeCbor('')).toThrow(/Paste some JSON/);
  });
});

function diagnoseAgain(hex: string): string {
  return decodeCbor(hex).diagnostic;
}
