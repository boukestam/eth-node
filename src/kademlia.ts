import { Endpoint } from "./endpoint";

const K = 16;
const DEPTH = 256;

interface KademliaItem {
  nodeId: Buffer;
  distance: Buffer;
  endpoint: Endpoint;
}

function isSet (buffer: Buffer, bit: number) {
  return buffer[bit >> 3] & (1 << (7 - (bit % 8)));
}

export class KademliaTable {
  buckets: KademliaItem[][];
  isAlive: (item: KademliaItem) => Promise<boolean>;

  constructor (isAlive: (item: KademliaItem) => Promise<boolean>) {
    this.buckets = [[]];
    this.isAlive = isAlive;
  }

  async add (distance: Buffer, item: KademliaItem) {
    const split = (depth, bucket) => {
      this.buckets[depth] = bucket.filter(item => isSet(item.distance, depth));
      this.buckets.push(bucket.filter(item => !isSet(item.distance, depth)));
    };
    
    for (let depth = 0; depth < DEPTH && depth < this.buckets.length; depth++) {
      const bucket = this.buckets[depth];
  
      if (isSet(distance, depth)) {
        if (bucket.length === K && depth === this.buckets.length - 1 && depth < DEPTH - 1) {
          split(depth, bucket);
        }
  
        if (bucket.length < K) return bucket.push(item);
  
        for (let i = bucket.length - 1; i >= 0; i--) {
          if (!(await this.isAlive(bucket[i]))) return bucket.splice(i, 1, item);
        }
  
        return;
      } else {
        if (bucket.length === K) {
          split(depth, bucket);
        } else if (depth === this.buckets.length - 1) {
          return bucket.push(item);
        }
      }
    }
  }
}