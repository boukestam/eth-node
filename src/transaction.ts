import { rlpEncode } from "./rlp";
import { keccak256 } from "./util";

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
    return keccak256(rlpEncode(this.raw));
  }
}