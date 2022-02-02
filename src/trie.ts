import { rlpDecode, rlpEncode } from "./rlp";
import { keccak256 } from "./util";

class Storage {
  storage: {[key: string]: Buffer};

  constructor () {
    this.storage = {};
  }

  get (key: Buffer) {
    return this.storage[key.toString('hex')];
  }

  put (key: Buffer, value: Buffer) {
    this.storage[key.toString('hex')] = value;
  }

  del (key: Buffer) {
    delete this.storage[key.toString('hex')];
  }
}

function nibbles (buffer: Buffer): number[] {
  const output = [];

  for (const byte of buffer) {
    output.push(byte >> 4);
    output.push(byte & 0x0f);
  }
  
  return output;
}

function encodeKey (type: number, path: number[]): Buffer {
  const odd = path.length % 2;
  const prefix = [type * 2 + odd];
  if (!odd) prefix.push(0);
  
  const keyNibbles = [...prefix, ...path];
  const bytes = [];

  for (let i = 0; i < keyNibbles.length; i += 2) {
    bytes.push((keyNibbles[i] << 4) + keyNibbles[i + 1]);
  }

  return Buffer.from(bytes);
}

function decodeKey (key: Buffer): [number, number[]] {
  const keyNibbles = nibbles(key);

  const type = keyNibbles[0] >> 1;
  const odd = keyNibbles[0] % 2;
  const value = keyNibbles.slice(odd ? 1 : 2);

  return [type, value];
}

function match (a: number[], b: number[]): number {
  let count = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i] === b[i]) count++;
    else break;
  }
  return count;
}

export class Trie {

  root: Buffer;
  storage: Storage;

  constructor (root?: Buffer) {
    this.storage = new Storage();
    this.root = root || this.writeHash(rlpEncode(Buffer.alloc(0)));
  }

  getRecursive (node: Buffer, path: number[]): Buffer | null {
    if (node.length === 0) return null; // empty node

    const nodeList: Buffer[] = rlpDecode(node.length < 32 ? node : this.storage.get(node));

    if (nodeList.length === 17) { // branch
      if (path.length === 0) return nodeList[16];
      return this.getRecursive(nodeList[path[0]], path.slice(1));
    }

    const [type, key] = decodeKey(nodeList[0]);
    const matched = match(key, path);

    if (type === 0) { // extension
      if (matched < key.length) return null;
      return this.getRecursive(nodeList[1], path.slice(matched));
    }
    
    if (type === 1) { // leaf
      if (matched !== key.length || matched !== path.length) return null;
      return nodeList[1];
    }

    throw new Error('Unknown node type');
  }

  get (key: Buffer): Buffer | null {
    return this.getRecursive(this.root, nibbles(key));
  }

  writeHash (value: Buffer) {
    const hash = keccak256(value);
    this.storage.put(hash, value);
    return hash;
  }

  valuenise (value: any, forceHash?: boolean): Buffer {
    const encoded = rlpEncode(value);

    if (encoded.length >= 32 || forceHash) {
      return this.writeHash(encoded);
    } else {
      return encoded;
    }
  }

  putRecursive (node: Buffer, path: number[], value: Buffer): Buffer[] {
    const isHash = node.length >= 32;
    const nodeList: Buffer[] = rlpDecode(isHash ? this.storage.get(node) : node);
    if (isHash) this.storage.del(node);

    if (nodeList.length === 0 || path.length == 0) { // empty node
      // Empty node reached, adding leaf node
      return [encodeKey(1, path), value]; // new leaf node
    }

    if (nodeList.length === 17) { // branch
      if (path.length === 0) {
        // Branch reached, setting value
        nodeList[16] = value;
      } else {
        nodeList[path[0]] = this.valuenise(this.putRecursive(nodeList[path[0]], path.slice(1), value));
      }
      
      return nodeList;
    }

    const [nodeType, nodeKey] = decodeKey(nodeList[0]);
    const matched = match(nodeKey, path);

    const branch = (): Buffer[] => {
      const branch = [];
      for (let i = 0; i < 17; i++) branch.push(Buffer.alloc(0));

      if (matched === nodeKey.length && nodeType === 1) {
        branch[16] = nodeList[1];
      } else if (nodeType === 1 || nodeKey.slice(matched + 1).length > 0) {
        branch[nodeKey[matched]] = this.valuenise([encodeKey(nodeType, nodeKey.slice(matched + 1)), nodeList[1]]);
      } else {
        branch[nodeKey[matched]] = nodeList[1];
      }

      if (matched === path.length) {
        branch[16] = value;
      } else {
        branch[path[matched]] = this.valuenise([encodeKey(1, path.slice(matched + 1)), value]);
      }

      return branch;
    };

    if (matched === 0) {
      // No match, branching
      return branch();
    }

    if (nodeType === 0) { // extension
      if (matched < nodeKey.length) {
        // Extension reached, shortening extension and adding branch
        return [encodeKey(0, path.slice(0, matched)), this.valuenise(branch(), true)]; // extension
      }

      return [nodeList[0], this.valuenise(this.putRecursive(nodeList[1], path.slice(matched), value), true)];
    }
    
    if (nodeType === 1) { // leaf
      if (matched < nodeKey.length || matched < path.length) {
        // Leaf reached, adding extension and branch
        return [encodeKey(0, path.slice(0, matched)), this.valuenise(branch(), true)];
      }

      // Leaf reached, writing value
      return [nodeList[0], value];
    }

    throw new Error('Unknown node type');
  }

  put (key: Buffer, value: Buffer) {
    this.root = this.valuenise(this.putRecursive(this.root, nibbles(key), value));
  }

  deleteValue (value: Buffer): Buffer {
    if (value.length >= 32) {
      this.storage.del(value);
    }
    return Buffer.alloc(0);
  }

  delRecursive (node: Buffer, path: number[]): Buffer {
    if (node.length === 0) throw new Error('Key not found');

    const isHash = node.length >= 32;
    const nodeList: Buffer[] = rlpDecode(!isHash ? node : this.storage.get(node));

    if (nodeList.length === 17) { // branch
      if (path.length === 0) {
        // Branch reached, setting value
        nodeList[16] = this.deleteValue(nodeList[16]);
      } else {
        nodeList[path[0]] = this.delRecursive(nodeList[path[0]], path.slice(1));
      }

      let hasNotNullBranch = false;
      for (let i = 0; i < 16; i++) if (nodeList[i].length > 0) hasNotNullBranch = true;

      if (!hasNotNullBranch) {
        if (nodeList[16].length > 0) {
          this.deleteValue(node);
          return this.valuenise([encodeKey(1, path), nodeList[16]]); // new leaf node
        } else {
          return this.deleteValue(node);
        }
      }
      
      return this.valuenise(nodeList);
    }

    const [nodeType, nodeKey] = decodeKey(nodeList[0]);
    const matched = match(nodeKey, path);

    if (matched === 0) throw new Error('Key not found');

    if (nodeType === 0) { // extension
      if (matched < nodeKey.length) throw new Error('Key not found');

      return this.delRecursive(nodeList[1], path.slice(matched));
    }
    
    if (nodeType === 1) { // leaf
      if (matched < nodeKey.length) throw new Error('Key not found');

      // Leaf reached, deleting value
      return this.deleteValue(node);
    }

    throw new Error('Unknown node type');
  }

  del (key: Buffer) {
    try {
      this.root = this.delRecursive(this.root, nibbles(key));
    } catch {
      // key not found
    }
  }
}
