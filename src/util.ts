import secp256k1, { publicKeyConvert } from 'secp256k1';
import crypto from 'crypto';
import createKeccakHash from 'keccak';
import { rlpDecode } from './rlp';

export function generatePrivateKey (): Buffer {
  while (true) {
    const privateKey = crypto.randomBytes(32)
    if (secp256k1.privateKeyVerify(privateKey)) return privateKey
  }
}

export function publicFromPrivate (privateKey: Buffer): Buffer {
  return Buffer.from(secp256k1.publicKeyCreate(privateKey, false));
}

export function printBytes (s: string, x: Uint8Array): void {
  console.log(s, x.length, x);
}

// export function int16ToBuffer (n: number): Buffer {
//   return Buffer.from(new Int16Array([n]));
// }

// export function uint16ToBuffer (n: number): Buffer {
//   return Buffer.from(new Uint16Array([n]));
// }

export function keccak256 (buffer) {
  const hash = createKeccakHash('keccak256');
  hash.update(buffer);
  return hash.digest()
}

export function keccak256Array (buffers: Buffer[]) {
  const hash = createKeccakHash('keccak256');
  for (const buffer of buffers) hash.update(buffer);
  return hash.digest()
}

export function keccak512 (buffer) {
  const hash = createKeccakHash('keccak512');
  hash.update(buffer);
  return hash.digest()
}

export function keccak512Array (buffers: Buffer[]) {
  const hash = createKeccakHash('keccak512');
  for (const buffer of buffers) hash.update(buffer);
  return hash.digest()
}

export function idToPK (id: Buffer) {
  return Buffer.concat([Buffer.from([0x04]), id]);
}

export function pkToId (pk: Buffer) {
  if (pk.length === 33) {
    pk = Buffer.from(publicKeyConvert(pk, false));
  }
  return pk.slice(1);
}

export function intToBuffer (v: number) {
  if (v === 0) return Buffer.alloc(0);
  let hex = v.toString(16)
  if (hex.length % 2 === 1) hex = '0' + hex
  return Buffer.from(hex, 'hex')
}

export function bufferToInt (buffer: Buffer): number {
  if (buffer.length === 0) return 0;

  let n = 0;
  for (let i = 0; i < buffer.length; ++i) n = n * 256 + buffer[i];
  return n;
}

export function bufferToBigInt (buffer: Buffer): bigint {
  if (buffer.length === 0) return 0n;

  let n = 0n;
  for (let i = 0; i < buffer.length; ++i) n = n * 256n + BigInt(buffer[i]);
  return n;
}

export function assertEq(expected: any, actual: any, msg: string): void {
  if (Buffer.isBuffer(expected) && Buffer.isBuffer(actual)) {
    if (expected.equals(actual)) return;
    throw new Error(`${msg}: ${expected.toString('hex')} / ${actual.toString('hex')}`);
  }

  if (expected === actual) return;

  throw new Error(`${msg}: ${expected} / ${actual}`);
}

export function zfill(buffer: Buffer, size: number, leftpad: boolean = true): Buffer {
  if (buffer.length >= size) return buffer
  if (leftpad === undefined) leftpad = true
  const pad = Buffer.allocUnsafe(size - buffer.length).fill(0x00)
  return leftpad ? Buffer.concat([pad, buffer]) : Buffer.concat([buffer, pad])
}

export function unstrictDecode(value: Buffer) {
  // rlp library throws on remainder.length !== 0
  // this utility function bypasses that
  return (rlpDecode(value, true) as any).data
}

export function copy(buffer: Buffer) {
  const clone = Buffer.alloc(buffer.length);
  buffer.copy(clone);
  return clone;
}

export function reverseBuffer (buffer: Buffer) {
  const reversed = Buffer.alloc(buffer.length);
  const end = buffer.length - 1;

  for (let i = end; i >= 0; i--) {
    reversed[end - i] = buffer[i];
  }

  return reversed;
}