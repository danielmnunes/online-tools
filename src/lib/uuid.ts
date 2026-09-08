/**
 * RFC 9562 UUIDs, generated in the browser.
 *
 * v3 and v5 are hashed with @noble/hashes (MD5 and SHA-1), the same
 * implementations the rest of the site uses. v1, v4, v6 and v7 take their
 * random bits from crypto.getRandomValues. There is no Math.random on this
 * path, and the node ID for v1/v6 is a random multicast address rather than
 * a hardware MAC — browsers do not expose those, and RFC 9562 §6.10 says to
 * set the multicast bit so the two can never collide.
 *
 * The layout tests are the appendix A vectors of RFC 9562. v3 and v5 are
 * also re-derived inside the suite from the MD5/SHA-1 of namespace||name,
 * which is the construction the RFC describes rather than a value copied
 * from another generator.
 */
import { md5, sha1 } from '@noble/hashes/legacy.js';
import { bytesToHex, hexToBytes } from '~/lib/encoding';

export type UuidVersion = 1 | 3 | 4 | 5 | 6 | 7;

export type UuidFormat = 'canonical' | 'canonical-upper' | 'hex' | 'hex-upper' | 'urn';

export type UuidVariant = 'ncs' | 'rfc9562' | 'microsoft' | 'future';

/**
 * The four namespaces RFC 9562 §6.6 inherits from RFC 4122.
 *
 * Names are hashed as UTF-8 of the usual spelling ("www.example.com"), not
 * as DNS wire format. That is what the appendix A vectors use.
 */
export const NAMESPACES = {
  dns: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  url: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  oid: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  x500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
} as const;

export type NamespaceId = keyof typeof NAMESPACES;

/** 100-nanosecond intervals between 1582-10-15 and 1970-01-01. */
const GREGORIAN_UNIX_OFFSET = 0x01b2_1dd2_1381_4000n;

export class UuidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UuidError';
  }
}

export function parseUuid(text: string): Uint8Array {
  let cleaned = text.trim();
  if (cleaned.toLowerCase().startsWith('urn:uuid:')) cleaned = cleaned.slice(9);
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    cleaned = cleaned.slice(1, -1);
  }
  cleaned = cleaned.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(cleaned)) {
    throw new UuidError('Not a UUID: need 32 hex digits, with or without hyphens.');
  }
  return hexToBytes(cleaned);
}

export function formatUuid(bytes: Uint8Array, format: UuidFormat = 'canonical'): string {
  if (bytes.length !== 16) {
    throw new UuidError(`A UUID is 16 bytes, not ${bytes.length}.`);
  }
  const hex = bytesToHex(bytes);
  const dashed = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  switch (format) {
    case 'canonical':
      return dashed;
    case 'canonical-upper':
      return dashed.toUpperCase();
    case 'hex':
      return hex;
    case 'hex-upper':
      return hex.toUpperCase();
    case 'urn':
      return `urn:uuid:${dashed}`;
  }
}

export function uuidVersion(bytes: Uint8Array): number {
  return bytes[6]! >> 4;
}

export function uuidVariant(bytes: Uint8Array): UuidVariant {
  const octet = bytes[8]!;
  if ((octet & 0x80) === 0) return 'ncs';
  if ((octet & 0xc0) === 0x80) return 'rfc9562';
  if ((octet & 0xe0) === 0xc0) return 'microsoft';
  return 'future';
}

function setVersionVariant(bytes: Uint8Array, version: UuidVersion): void {
  bytes[6] = (bytes[6]! & 0x0f) | (version << 4);
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/**
 * A 48-bit node with the multicast bit set, so it cannot collide with a
 * real IEEE 802 address (RFC 9562 §6.10).
 */
export function randomNode(): Uint8Array {
  const node = randomBytes(6);
  node[0] = node[0]! | 0x01;
  return node;
}

function write48(view: DataView, offset: number, value: bigint): void {
  view.setUint16(offset, Number((value >> 32n) & 0xffffn));
  view.setUint32(offset + 2, Number(value & 0xffff_ffffn));
}

function read48(bytes: Uint8Array, offset: number): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return (BigInt(view.getUint16(offset)) << 32n) | BigInt(view.getUint32(offset + 2));
}

export interface TimeUuidOptions {
  /** Unix milliseconds. Defaults to now. */
  readonly msecs?: number;
  /** Extra 100-ns ticks within that millisecond, 0–9999. */
  readonly nsecs?: number;
  /** 14-bit clock sequence. */
  readonly clockseq?: number;
  /** 6-byte node ID. Random multicast if omitted. */
  readonly node?: Uint8Array;
}

interface TimeState {
  msecs: number;
  nsecs: number;
  clockseq: number;
  node: Uint8Array;
}

let v1State: TimeState | undefined;
let v6State: TimeState | undefined;

interface V7State {
  msecs: number;
  seq: number;
}

let v7State: V7State | undefined;

/** Test hook: forget the monotonic counters. */
export function resetUuidState(): void {
  v1State = undefined;
  v6State = undefined;
  v7State = undefined;
}

function unixMsToGregorian(msecs: number, nsecs: number): bigint {
  if (!Number.isInteger(msecs) || msecs < 0) {
    throw new UuidError('Timestamp must be a non-negative integer of milliseconds.');
  }
  if (!Number.isInteger(nsecs) || nsecs < 0 || nsecs > 9999) {
    throw new UuidError('nsecs must be an integer between 0 and 9999.');
  }
  return BigInt(msecs) * 10000n + BigInt(nsecs) + GREGORIAN_UNIX_OFFSET;
}

function randomClockseq(): number {
  const bytes = randomBytes(2);
  return ((bytes[0]! << 8) | bytes[1]!) & 0x3fff;
}

function nextTimeState(state: TimeState | undefined, opts: TimeUuidOptions): TimeState {
  const now = opts.msecs ?? Date.now();
  const explicit = opts.msecs !== undefined || opts.nsecs !== undefined;
  let nsecs = opts.nsecs ?? 0;
  let clockseq = opts.clockseq ?? state?.clockseq ?? randomClockseq();
  let node = opts.node ?? state?.node ?? randomNode();

  if (opts.node !== undefined && opts.node.length !== 6) {
    throw new UuidError('A node ID is 6 bytes.');
  }
  if (opts.clockseq !== undefined && (opts.clockseq < 0 || opts.clockseq > 0x3fff)) {
    throw new UuidError('clockseq is a 14-bit integer (0–16383).');
  }

  if (explicit) {
    return { msecs: now, nsecs, clockseq, node };
  }

  if (state !== undefined && now === state.msecs) {
    nsecs = state.nsecs + 1;
    clockseq = state.clockseq;
    node = state.node;
    if (nsecs > 9999) {
      nsecs = 0;
      clockseq = (clockseq + 1) & 0x3fff;
    }
  } else if (state !== undefined && now < state.msecs) {
    // Clock stepped backwards: bump the sequence rather than repeating.
    clockseq = (state.clockseq + 1) & 0x3fff;
    nsecs = 0;
    node = state.node;
  } else if (state !== undefined) {
    clockseq = state.clockseq;
    node = state.node;
    nsecs = 0;
  }

  return { msecs: now, nsecs, clockseq, node };
}

function writeTimeUuid(version: 1 | 6, gregorian: bigint, clockseq: number, node: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);

  if (version === 1) {
    view.setUint32(0, Number(gregorian & 0xffff_ffffn));
    view.setUint16(4, Number((gregorian >> 32n) & 0xffffn));
    view.setUint16(6, Number((gregorian >> 48n) & 0x0fffn));
  } else {
    view.setUint32(0, Number((gregorian >> 28n) & 0xffff_ffffn));
    view.setUint16(4, Number((gregorian >> 12n) & 0xffffn));
    view.setUint16(6, Number(gregorian & 0x0fffn));
  }

  bytes[8] = (clockseq >> 8) & 0x3f;
  bytes[9] = clockseq & 0xff;
  bytes.set(node, 10);
  setVersionVariant(bytes, version);
  return bytes;
}

export function uuidV1Bytes(opts: TimeUuidOptions = {}): Uint8Array {
  const next = nextTimeState(opts.msecs === undefined && opts.nsecs === undefined ? v1State : undefined, opts);
  if (opts.msecs === undefined && opts.nsecs === undefined) v1State = next;
  return writeTimeUuid(1, unixMsToGregorian(next.msecs, next.nsecs), next.clockseq, next.node);
}

export function uuidV6Bytes(opts: TimeUuidOptions = {}): Uint8Array {
  const next = nextTimeState(opts.msecs === undefined && opts.nsecs === undefined ? v6State : undefined, opts);
  if (opts.msecs === undefined && opts.nsecs === undefined) v6State = next;
  return writeTimeUuid(6, unixMsToGregorian(next.msecs, next.nsecs), next.clockseq, next.node);
}

export interface V7Options {
  readonly msecs?: number;
  /** The 10 bytes after the timestamp; version and variant bits are applied on top. */
  readonly tail?: Uint8Array;
}

export function uuidV7Bytes(opts: V7Options = {}): Uint8Array {
  const explicit = opts.msecs !== undefined || opts.tail !== undefined;
  let msecs = opts.msecs ?? Date.now();
  let seq = 0;
  let tail = opts.tail;

  if (tail !== undefined && tail.length !== 10) {
    throw new UuidError('v7 tail is the 10 bytes after the timestamp.');
  }

  if (!explicit) {
    if (v7State !== undefined && msecs === v7State.msecs) {
      seq = v7State.seq + 1;
      if (seq > 0x0fff) {
        msecs += 1;
        seq = 0;
      }
    } else if (v7State !== undefined && msecs < v7State.msecs) {
      msecs = v7State.msecs;
      seq = v7State.seq + 1;
      if (seq > 0x0fff) {
        msecs += 1;
        seq = 0;
      }
    }
    v7State = { msecs, seq };
  }

  const bytes = new Uint8Array(16);
  write48(new DataView(bytes.buffer), 0, BigInt(msecs));
  if (tail !== undefined) {
    bytes.set(tail, 6);
  } else {
    bytes.set(randomBytes(10), 6);
    // RFC 9562 §6.2 method 1: the 12-bit rand_a field is a monotonic counter
    // when several UUIDs are minted in the same millisecond.
    if (!explicit) {
      bytes[6] = (seq >> 4) & 0xff;
      bytes[7] = ((seq & 0x0f) << 4) | (bytes[7]! & 0x0f);
    }
  }
  setVersionVariant(bytes, 7);
  return bytes;
}

export function uuidV4Bytes(random?: Uint8Array): Uint8Array {
  const bytes = random !== undefined ? new Uint8Array(random) : randomBytes(16);
  if (bytes.length !== 16) throw new UuidError('v4 random input is 16 bytes.');
  setVersionVariant(bytes, 4);
  return bytes;
}

function nameUuid(version: 3 | 5, namespace: Uint8Array | string, name: string): Uint8Array {
  const ns = typeof namespace === 'string' ? parseUuid(namespace) : namespace;
  if (ns.length !== 16) throw new UuidError('A namespace UUID is 16 bytes.');
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns);
  input.set(nameBytes, ns.length);
  const digest = version === 3 ? md5(input) : sha1(input).subarray(0, 16);
  const bytes = new Uint8Array(digest);
  setVersionVariant(bytes, version);
  return bytes;
}

export function uuidV3Bytes(namespace: Uint8Array | string, name: string): Uint8Array {
  return nameUuid(3, namespace, name);
}

export function uuidV5Bytes(namespace: Uint8Array | string, name: string): Uint8Array {
  return nameUuid(5, namespace, name);
}

export function generateUuid(
  version: UuidVersion,
  opts: {
    format?: UuidFormat;
    time?: TimeUuidOptions;
    v7?: V7Options;
    random?: Uint8Array;
    namespace?: Uint8Array | string;
    name?: string;
  } = {},
): string {
  const format = opts.format ?? 'canonical';
  switch (version) {
    case 1:
      return formatUuid(uuidV1Bytes(opts.time), format);
    case 3:
      if (opts.namespace === undefined) throw new UuidError('v3 needs a namespace.');
      return formatUuid(uuidV3Bytes(opts.namespace, opts.name ?? ''), format);
    case 4:
      return formatUuid(uuidV4Bytes(opts.random), format);
    case 5:
      if (opts.namespace === undefined) throw new UuidError('v5 needs a namespace.');
      return formatUuid(uuidV5Bytes(opts.namespace, opts.name ?? ''), format);
    case 6:
      return formatUuid(uuidV6Bytes(opts.time), format);
    case 7:
      return formatUuid(uuidV7Bytes(opts.v7), format);
  }
}

export interface UuidInfo {
  readonly canonical: string;
  readonly version: number;
  readonly variant: UuidVariant;
  readonly timestamp?: Date;
  readonly unixMs?: number;
  readonly clockSequence?: number;
  readonly node?: string;
  readonly multicastNode?: boolean;
}

function gregorianToDate(gregorian: bigint): Date {
  const unix100ns = gregorian - GREGORIAN_UNIX_OFFSET;
  const ms = unix100ns / 10000n;
  return new Date(Number(ms));
}

export function inspectUuid(text: string): UuidInfo {
  const bytes = parseUuid(text);
  const version = uuidVersion(bytes);
  const variant = uuidVariant(bytes);
  const info: {
    canonical: string;
    version: number;
    variant: UuidVariant;
    timestamp?: Date;
    unixMs?: number;
    clockSequence?: number;
    node?: string;
    multicastNode?: boolean;
  } = {
    canonical: formatUuid(bytes),
    version,
    variant,
  };

  if (version === 1 || version === 6) {
    let gregorian: bigint;
    if (version === 1) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      gregorian =
        (BigInt(view.getUint16(6) & 0x0fff) << 48n) |
        (BigInt(view.getUint16(4)) << 32n) |
        BigInt(view.getUint32(0));
    } else {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      gregorian =
        (BigInt(view.getUint32(0)) << 28n) |
        (BigInt(view.getUint16(4)) << 12n) |
        BigInt(view.getUint16(6) & 0x0fff);
    }
    info.timestamp = gregorianToDate(gregorian);
    info.clockSequence = ((bytes[8]! & 0x3f) << 8) | bytes[9]!;
    const node = bytes.subarray(10, 16);
    info.node = bytesToHex(node);
    info.multicastNode = (node[0]! & 0x01) === 1;
  }

  if (version === 7) {
    const unixMs = Number(read48(bytes, 0));
    info.unixMs = unixMs;
    info.timestamp = new Date(unixMs);
  }

  return info;
}
