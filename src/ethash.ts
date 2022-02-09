import { copy, keccak256, keccak256Array, keccak512, keccak512Array, reverseBuffer } from "./util";
import { xor } from 'bitwise-buffer';

// See https://eth.wiki/en/concepts/ethash/ethash

const WORD_BYTES = 4;                    // bytes in word
const DATASET_BYTES_INIT = 2**30;        // bytes in dataset at genesis
const DATASET_BYTES_GROWTH = 2**23;      // dataset growth per epoch
const CACHE_BYTES_INIT = 2**24;          // bytes in cache at genesis
const CACHE_BYTES_GROWTH = 2**17;        // cache growth per epoch
const CACHE_MULTIPLIER = 1024;           // Size of the DAG relative to the cache
const EPOCH_LENGTH = 30000;              // blocks per epoch
const MIX_BYTES = 128;                   // width of mix
const HASH_BYTES = 64;                   // hash length in bytes
const DATASET_PARENTS = 256;             // number of parents of each dataset element
const CACHE_ROUNDS = 3;                  // number of rounds in cache production
const ACCESSES = 64;                     // number of accesses in hashimoto loop

function isPrime (x: number) {
  const max = Math.floor(x**0.5);
  for (let i = 2; i < max; i++) {
    if (x % i == 0) return false;
  }
  return true;
}

export function getCacheSize (blockNumber: number) {
  let sz = CACHE_BYTES_INIT + CACHE_BYTES_GROWTH * Math.floor(blockNumber / EPOCH_LENGTH);
  sz -= HASH_BYTES;
  while (!isPrime(sz / HASH_BYTES)) {
    sz -= 2 * HASH_BYTES;
  }
  return sz;
}

export function getFullSize (blockNumber: number) {
  let sz = DATASET_BYTES_INIT + DATASET_BYTES_GROWTH * Math.floor(blockNumber / EPOCH_LENGTH);
  sz -= MIX_BYTES;
  while (!isPrime(sz / MIX_BYTES)) {
    sz -= 2 * MIX_BYTES
  }
  return sz;
}

export function getSeed (block: number): Buffer {
  let s = Buffer.alloc(32);
  const epochs = Math.floor(block / EPOCH_LENGTH);

  for (let i = 0; i < epochs; i++) s = keccak256(s);

  return s;
}

export function generateCache (cacheSize: number, seed: Buffer): Buffer[] {
  const n = Math.floor(cacheSize / HASH_BYTES);

  // Sequentially produce the initial dataset
  const o: Buffer[] = [keccak512(seed)];
  for (let i = 1; i < n; i++) {
    o.push(keccak512(o[o.length - 1]));
  }

  // Use a low-round version of randmemohash
  for (let x = 0; x < CACHE_ROUNDS; x++) {
    for (let i = 0; i < n; i++) {
      const v = o[i].readUInt32LE(0) % n;
      o[i] = keccak512(xor(o[(i - 1 + n) % n], o[v]));
    }
  }

  return o;
}

export function fnv(x: number, y: number) {
  return ((((x * 0x01000000) | 0) + ((x * 0x193) | 0)) ^ y) >>> 0
}

export function fnvBuffer(a: Buffer, b: Buffer) {
  const r = Buffer.alloc(a.length)
  for (let i = 0; i < a.length; i = i + 4) {
    r.writeUInt32LE(fnv(a.readUInt32LE(i), b.readUInt32LE(i)), i)
  }
  return r
}

function generateDatasetItem(cache: Buffer[], i: number): Buffer {
  const n = cache.length;
  const r = Math.floor(HASH_BYTES / WORD_BYTES);

  // initialize the mix
  let mix: Buffer = copy(cache[i % n]);
  mix.writeInt32LE(mix.readUInt32LE(0) ^ i, 0)
  mix = keccak512(mix);

  // fnv it with a lot of random cache nodes based on i
  for (let j = 0; j < DATASET_PARENTS; j++) {
    const cacheIndex = fnv(i ^ j, mix.readUInt32LE((j % r) * 4));
    const cacheItem = cache[cacheIndex % n];
    mix = fnvBuffer(mix, cacheItem);
  }

  return keccak512(mix);
}

export function hashimoto(cache: Buffer[], header: Buffer, nonce: Buffer, fullSize: number) {
  const n = fullSize / HASH_BYTES;
  const w = Math.floor(MIX_BYTES / WORD_BYTES);
  const mixhashes = MIX_BYTES / HASH_BYTES;

  // combine header+nonce into a 64 byte seed
  const s = keccak512Array([header, reverseBuffer(nonce)]);
  
  // start the mix with replicated s
  let mix: Buffer = Buffer.alloc(MIX_BYTES);
  for (let i = 0; i < MIX_BYTES / HASH_BYTES; i++) {
    mix.set(s, i * HASH_BYTES);
  }

  // mix in random dataset nodes
  for (let i = 0; i < ACCESSES; i++) {
    const p = fnv(i ^ s.readUInt32LE(0), mix.readUInt32LE((i % w) * 4)) % Math.floor(n / mixhashes) * mixhashes;
    const newdata = Buffer.alloc(MIX_BYTES);
    for (let j = 0; j < MIX_BYTES / HASH_BYTES; j++) {
      newdata.set(generateDatasetItem(cache, p + j), j * HASH_BYTES);
    }
    mix = fnvBuffer(mix, newdata);
  }

  // compress mix
  const cmix = Buffer.alloc(mix.length / 4)
  for (let i = 0; i < mix.length / 4; i = i + 4) {
    const a = fnv(mix.readUInt32LE(i * 4), mix.readUInt32LE((i + 1) * 4))
    const b = fnv(a, mix.readUInt32LE((i + 2) * 4))
    const c = fnv(b, mix.readUInt32LE((i + 3) * 4))
    cmix.writeUInt32LE(c, i)
  }

  return {
    mixDigest: cmix,
    result: keccak256Array([s, cmix])
  }
}