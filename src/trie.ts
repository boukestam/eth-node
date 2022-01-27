import { rlpDecode } from "./rlp";

const storage: {[key: string]: Buffer} = {};
const read = (key: Buffer) => storage[key.toString('hex')];
const write = (key: Buffer, value: Buffer) => storage[key.toString('hex')] = value;

function nibbles (buffer: Buffer): number[] {
  const output = [];

  for (const byte of buffer) {
    output.push(byte >> 4);
    output.push(byte & 0xf0);
  }
  
  return output;
}

class Trie {

  root: Buffer;

  constructor () {
    this.root = Buffer.from([0]);
  }

  add (key: Buffer, value: Buffer) {
    
  }

  get (key: Buffer): Buffer {
    let node = this.root;

    let path = nibbles(key);
    path.push(16);

    if (path.length === 0 || node.length === 0) return node;

    const nodeList = rlpDecode(node.length < 32 ? node : read(node));

    if (nodeList.length === 2) {
      const [nodeKey, nodeValue] = nodeList;
      

    }

    const flag = nibble(value, 0);
    const even = flag % 2 === 0;

    let index = even ? 2 : 1;

    if (flag > 1) {
      // leaf
      while (index < )
    } else {
      // extension

    }
  }
}
