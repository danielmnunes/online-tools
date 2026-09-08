/**
 * RFC 9562 UUIDs.
 *
 * Appendix A of the RFC is the published vectors. v3 and v5 are also
 * re-derived here from MD5/SHA-1 of namespace||name, with the version and
 * variant bits applied in the test — the same construction the RFC describes,
 * not a value copied from another generator. v1/v6/v4/v7 with known inputs
 * are compared to the `uuid` package, which shares no code with this module.
 */
import { md5, sha1 } from '@noble/hashes/legacy.js';
import { describe, expect, it } from 'vitest';
import { v1 as uuidjsV1, v3 as uuidjsV3, v5 as uuidjsV5, v6 as uuidjsV6 } from 'uuid';
import { hexToBytes } from '~/lib/encoding';
import {
  NAMESPACES,
  formatUuid,
  inspectUuid,
  parseUuid,
  resetUuidState,
  uuidV1Bytes,
  uuidV3Bytes,
  uuidV4Bytes,
  uuidV5Bytes,
  uuidV6Bytes,
  uuidV7Bytes,
  uuidVariant,
  uuidVersion,
} from '~/lib/uuid';

const DNS_NAME = 'www.example.com';

function overlay(bytes: Uint8Array, version: number): Uint8Array {
  const out = new Uint8Array(bytes);
  out[6] = (out[6]! & 0x0f) | (version << 4);
  out[8] = (out[8]! & 0x3f) | 0x80;
  return out;
}

describe('RFC 9562 appendix A', () => {
  const msecs = 1645557742000;
  const node = hexToBytes('9f6bdeced846');
  const clockseq = 0x33c8;

  it('v1 matches the published vector', () => {
    expect(
      formatUuid(uuidV1Bytes({ msecs, nsecs: 0, clockseq, node })).toUpperCase(),
    ).toBe('C232AB00-9414-11EC-B3C8-9F6BDECED846');
  });

  it('v6 is the same instant reordered', () => {
    expect(
      formatUuid(uuidV6Bytes({ msecs, nsecs: 0, clockseq, node })).toUpperCase(),
    ).toBe('1EC9414C-232A-6B00-B3C8-9F6BDECED846');
  });

  it('v3 DNS + www.example.com', () => {
    expect(formatUuid(uuidV3Bytes(NAMESPACES.dns, DNS_NAME))).toBe(
      '5df41881-3aed-3515-88a7-2f4a814cf09e',
    );
  });

  it('v4 overlays version and variant on the published random bytes', () => {
    expect(formatUuid(uuidV4Bytes(hexToBytes('919108f752d133205bacf847db4148a8')))).toBe(
      '919108f7-52d1-4320-9bac-f847db4148a8',
    );
  });

  it('v5 DNS + www.example.com', () => {
    expect(formatUuid(uuidV5Bytes(NAMESPACES.dns, DNS_NAME))).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });

  it('v7 overlays the published tail on the published timestamp', () => {
    expect(
      formatUuid(
        uuidV7Bytes({ msecs, tail: hexToBytes('ccc398c4dc0c0c07398f') }),
      ).toUpperCase(),
    ).toBe('017F22E2-79B0-7CC3-98C4-DC0C0C07398F');
  });
});

describe('re-derivation of v3 and v5', () => {
  it('v3 is MD5(namespace || name) with version 3 and variant 10', () => {
    const ns = parseUuid(NAMESPACES.dns);
    const name = new TextEncoder().encode(DNS_NAME);
    const input = new Uint8Array(ns.length + name.length);
    input.set(ns);
    input.set(name, ns.length);
    const digest = overlay(md5(input), 3);
    expect(formatUuid(digest)).toBe(formatUuid(uuidV3Bytes(NAMESPACES.dns, DNS_NAME)));
    expect(formatUuid(digest)).toBe('5df41881-3aed-3515-88a7-2f4a814cf09e');
  });

  it('v5 is the first 16 bytes of SHA-1(namespace || name) with version 5', () => {
    const ns = parseUuid(NAMESPACES.dns);
    const name = new TextEncoder().encode(DNS_NAME);
    const input = new Uint8Array(ns.length + name.length);
    input.set(ns);
    input.set(name, ns.length);
    const digest = overlay(sha1(input).subarray(0, 16), 5);
    expect(formatUuid(digest)).toBe(formatUuid(uuidV5Bytes(NAMESPACES.dns, DNS_NAME)));
    expect(formatUuid(digest)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('derives the Gregorian–Unix offset from the two epochs', () => {
    const ms = -Date.UTC(1582, 9, 15);
    const ticks = BigInt(ms) * 10000n;
    expect(ticks).toBe(0x01b2_1dd2_1381_4000n);
  });
});

describe('parity with the uuid package', () => {
  it('v1 with the documented options', () => {
    const options = {
      node: Uint8Array.of(0x01, 0x23, 0x45, 0x67, 0x89, 0xab),
      clockseq: 0x1234,
      msecs: new Date('2011-11-01').getTime(),
      nsecs: 5678,
    };
    expect(formatUuid(uuidV1Bytes(options))).toBe(uuidjsV1(options));
    expect(formatUuid(uuidV1Bytes(options))).toBe('710b962e-041c-11e1-9234-0123456789ab');
  });

  it('v6 with the same options', () => {
    const options = {
      node: Uint8Array.of(0x01, 0x23, 0x45, 0x67, 0x89, 0xab),
      clockseq: 0x1234,
      msecs: new Date('2011-11-01').getTime(),
      nsecs: 5678,
    };
    expect(formatUuid(uuidV6Bytes(options))).toBe(uuidjsV6(options));
  });

  it('v3 and v5 against the DNS namespace', () => {
    expect(formatUuid(uuidV3Bytes(NAMESPACES.dns, DNS_NAME))).toBe(uuidjsV3(DNS_NAME, uuidjsV3.DNS));
    expect(formatUuid(uuidV5Bytes(NAMESPACES.dns, DNS_NAME))).toBe(uuidjsV5(DNS_NAME, uuidjsV5.DNS));
  });
});

describe('parse, format and inspect', () => {
  it('accepts URN, braces and hex', () => {
    const canonical = '5df41881-3aed-3515-88a7-2f4a814cf09e';
    expect(formatUuid(parseUuid(canonical))).toBe(canonical);
    expect(formatUuid(parseUuid(canonical.toUpperCase()))).toBe(canonical);
    expect(formatUuid(parseUuid(`urn:uuid:${canonical}`))).toBe(canonical);
    expect(formatUuid(parseUuid(`{${canonical}}`))).toBe(canonical);
    expect(formatUuid(parseUuid(canonical.replaceAll('-', '')))).toBe(canonical);
  });

  it('rejects a truncated value', () => {
    expect(() => parseUuid('5df41881-3aed')).toThrow(/32 hex digits/);
  });

  it('reads version, variant and timestamp back from the v1 vector', () => {
    const info = inspectUuid('C232AB00-9414-11EC-B3C8-9F6BDECED846');
    expect(info.version).toBe(1);
    expect(info.variant).toBe('rfc9562');
    expect(info.timestamp?.toISOString()).toBe('2022-02-22T19:22:22.000Z');
    expect(info.node).toBe('9f6bdeced846');
    expect(info.multicastNode).toBe(true);
  });

  it('reads Unix milliseconds from the v7 vector', () => {
    const info = inspectUuid('017F22E2-79B0-7CC3-98C4-DC0C0C07398F');
    expect(info.version).toBe(7);
    expect(info.unixMs).toBe(1645557742000);
    expect(info.timestamp?.toISOString()).toBe('2022-02-22T19:22:22.000Z');
  });
});

describe('random generation', () => {
  it('sets version and RFC 9562 variant on v4', () => {
    const bytes = uuidV4Bytes();
    expect(uuidVersion(bytes)).toBe(4);
    expect(uuidVariant(bytes)).toBe('rfc9562');
  });

  it('sets the multicast bit on a generated v1 node', () => {
    const bytes = uuidV1Bytes();
    expect(bytes[10]! & 0x01).toBe(1);
    expect(uuidVersion(bytes)).toBe(1);
  });

  it('emits distinct v4 values', () => {
    const a = formatUuid(uuidV4Bytes());
    const b = formatUuid(uuidV4Bytes());
    expect(a).not.toBe(b);
  });

  it('keeps successive v7 values unique and non-decreasing in time', () => {
    resetUuidState();
    const a = uuidV7Bytes();
    const b = uuidV7Bytes();
    expect(formatUuid(a)).not.toBe(formatUuid(b));
    const ia = inspectUuid(formatUuid(a));
    const ib = inspectUuid(formatUuid(b));
    expect(ib.unixMs! >= ia.unixMs!).toBe(true);
  });
});
