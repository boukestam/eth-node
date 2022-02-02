import { intToBuffer, keccak256 } from './util';
import { Block } from './block';
import { rlpDecode, rlpEncode } from './rlp';
import { Trie } from './trie';
import { Client } from './client';

const client = new Client();

async function createState () {
  let blockNumber = 3000585;

  while (true) {
    const header = await client.db.get(Buffer.concat([Buffer.from('h'), intToBuffer(blockNumber)]));
    const body = await client.db.get(Buffer.concat([Buffer.from('b'), intToBuffer(blockNumber)]));

    const block = new Block([rlpDecode(header), ...rlpDecode(body)]);
    const transactions = block.transactions();

    const trie = new Trie();

    for (let i = 0; i < transactions.length; i++) {
      const key = rlpEncode(i);
      trie.put(key, rlpEncode(transactions[i]));
    }
  }
}

//client.start();