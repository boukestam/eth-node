import { Endpoint } from "./endpoint";
import {xor} from 'bitwise-buffer';

const K = 16;
const DEPTH = 256;

interface KademliaItem<T> {
  id: Buffer;
  distance: Buffer;
  data: T;
}

function isSet (buffer: Buffer, bit: number) {
  return buffer[bit >> 3] & (1 << (7 - (bit % 8)));
}

export class KademliaTable<T> {
  rootId: Buffer;
  buckets: KademliaItem<T>[][];
  isAlive: (data: T) => Promise<boolean>;

  constructor (rootId: Buffer, isAlive: (data: T) => Promise<boolean>) {
    this.rootId = rootId;
    this.buckets = [[]];
    this.isAlive = isAlive;
  }

  async add (id: Buffer, data: T): Promise<boolean> {
    const distance = xor(this.rootId, id);
    const item = {id: id, data, distance};

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
  
        if (bucket.length < K) {
          bucket.push(item);
          return true;
        }
  
        for (let i = bucket.length - 1; i >= 0; i--) {
          const alive = await this.isAlive(bucket[i].data);
          if (!alive) {
            bucket.splice(i, 1, item);
            return true;
          }
        }
        
        return false;
      } else {
        if (bucket.length === K) {
          split(depth, bucket);
        } else if (depth === this.buckets.length - 1) {
          bucket.push(item);
          return true;
        }
      }
    }

    throw new Error('Error in table');
  }

  get (id: Buffer): T | null {
    for (const bucket of this.buckets) {
      for (let i = 0; i < bucket.length; i++) {
        if (bucket[i].id.equals(id)) {
          return bucket[i].data;
        }
      }
    }

    return null;
  }

  exists (id: Buffer): boolean {
    return !!this.get(id);
  }

  remove (id: Buffer) {
    for (const bucket of this.buckets) {
      for (let i = 0; i < bucket.length; i++) {
        if (bucket[i].id.equals(id)) {
          return bucket.splice(i, 1);
        }
      }
    }
  }

  closest (count: number, filter?: (data: T) => boolean, id?: Buffer) {
    const distances: {item: KademliaItem<T>, distance: Buffer}[] = [];

    for (const bucket of this.buckets) {
      for (const item of bucket) {
        if (filter && !filter(item.data)) continue;

        distances.push({
          item,
          distance: xor(id || this.rootId, item.id)
        });
      }
    }

    return distances.sort((a, b) => Buffer.compare(a.distance, b.distance)).slice(0, count).map(d => d.item.data);
  }

  size (): number {
    return this.buckets.reduce((a, v) => a + v.length, 0);
  }

  list (): T[] {
    const output: T[] = [];
    for (const bucket of this.buckets) {
      for (const item of bucket) output.push(item.data);
    }
    return output;
  }
}