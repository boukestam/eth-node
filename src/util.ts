import secp256k1 from 'secp256k1';
import crypto from 'crypto';
import createKeccakHash from 'keccak';

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

export function intToBuffer (v: number): Buffer {
  let hex = v.toString(16)
  if (hex.length % 2 === 1) hex = '0' + hex
  return Buffer.from(hex, 'hex')
}

export function int16ToBuffer (n: number): Buffer {
  return Buffer.from(new Int16Array([n]));
}

export function uint16ToBuffer (n: number): Buffer {
  return Buffer.from(new Uint16Array([n]));
}

export function keccak256 (...buffers) {
  const buffer = Buffer.concat(buffers)
  return createKeccakHash('keccak256').update(buffer).digest()
}