import { keccak256 } from "./util";
import * as rlp from 'rlp';

export class Transaction {

  // nonce: P,
  // gas-price: P,
  // gas-limit: P,
  // recipient: {B_0, B_20},
  // value: P,
  // data: B,
  // V: P,
  // R: P,
  // S: P,

  raw: Buffer[];

  constructor (raw: Buffer[]) {
    this.raw = raw;
  }

  hash () {
    return keccak256(rlp.encode(this.raw));
  }
}