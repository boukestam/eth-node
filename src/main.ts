import { bufferToBigInt, intToBuffer } from './util';
import { Block } from './block';
import { rlpDecode, rlpEncode } from './rlp';
import { MemoryStorage, Trie } from './trie';
import { Client } from './client';
import { Worker } from 'worker_threads';
import { getFullSize, hashimoto } from './ethash';

require('dotenv').config();

const client = new Client();

async function getBlock (blockNumber: number): Promise<Block> {
  const header = await client.db.get(Buffer.concat([Buffer.from('h'), intToBuffer(blockNumber)]));
  const body = await client.db.get(Buffer.concat([Buffer.from('b'), intToBuffer(blockNumber)]));

  return new Block([rlpDecode(header), ...rlpDecode(body)]);
}

async function createStateTrie () {
  let blockNumber = 3000585;

  while (true) {
    const block = await getBlock(blockNumber);
    const transactions = block.transactions();

    const trie = new Trie(new MemoryStorage());

    for (let i = 0; i < transactions.length; i++) {
      const key = rlpEncode(i);
      trie.put(key, rlpEncode(transactions[i].raw));
    }
  }
}

const worker = new Worker('./src/worker.js', {
  workerData: {
    path: './worker-cache.ts'
  }
});

function executeWorker<T> (worker: Worker, value: any): Promise<T> {
  return new Promise((resolve, reject) => {
    worker.postMessage(value);
    
    worker.on('message', (result) => {
      resolve(result as T);
    });
  });
}

let cache: Buffer[] | null = null;
let cachedBlockNumber = 0;
let fullSize = 0;

async function verifyPOW (blockNumber: number): Promise<boolean> {
  if (!cache || Math.floor(cachedBlockNumber / 30000) != Math.floor(blockNumber / 30000)) {
    cache = (await executeWorker<Uint8Array[]>(worker, blockNumber)).map(x => Buffer.from(x));
    cachedBlockNumber = blockNumber;
    fullSize = getFullSize(blockNumber);
  }

  const block = await getBlock(blockNumber);

  const {mixDigest, result} = hashimoto(cache, block.powHash(), block.blockNonce(), fullSize);

  return block.mixDigest().equals(mixDigest) && bufferToBigInt(result) < (2n ** 256n) / block.difficulty();
}

async function verify () {
  const start = Date.now();

  for (let i = 3000000; i < 3500000; i++) {
    const verified = await verifyPOW(i);
    if (!verified) throw new Error('Invalid POW');

    if (i % 100 === 0) console.log(`Verified ${i - 3000000} blocks after ${((Date.now() - start) / 60000).toFixed(1)} minutes`)
  }
}

async function test () {
  const block = await getBlock(2000003);
  for (const transaction of block.transactions()) {
    console.log(transaction.value());
    console.log(transaction.raw);
    console.log(transaction.origin());
  }
}

test().catch(console.error);


//client.start();