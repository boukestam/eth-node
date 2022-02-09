import { rlpEncode } from "./rlp";
import { bufferToBigInt, keccak256 } from "./util";

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

  nonce = () => bufferToBigInt(this.raw[0]);
  gasPrice = () => bufferToBigInt(this.raw[1]);
  gasLimit = () => bufferToBigInt(this.raw[2]);
  recipient = () => this.raw[3];
  value = () => bufferToBigInt(this.raw[4]);
  data = () => this.raw[5];

  hash () {
    return keccak256(rlpEncode(this.raw));
  }
}