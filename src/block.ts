import { rlpEncode } from "./rlp";
import { Transaction } from "./transaction";
import { bufferToBigInt, bufferToInt, keccak256 } from "./util";

export class Block {

  static HEADER_SIZE = 550;

  raw: any[];

  constructor (raw: any[]) {
    this.raw = raw;
  }

  header () {
    return this.raw[0];
  }

  transactions (): Transaction[] {
    return this.raw[1].map(r => new Transaction(r));
  }

  ommers () {
    return this.raw[2];
  }

  parentHash = () => this.raw[0][0];
  ommersHash = () => this.raw[0][1];
  coinbase = () => this.raw[0][2];
  stateRoot = () => this.raw[0][3];
  txsRoot = () => this.raw[0][4];
  receiptsRoot = () => this.raw[0][5];
  bloom = () => this.raw[0][6];
  difficulty = () => bufferToBigInt(this.raw[0][7]);
  number = () => bufferToInt(this.raw[0][8]);
  gasLimit = () => bufferToBigInt(this.raw[0][9]);
  gasUsed = () => bufferToBigInt(this.raw[0][10]);
  time = () => bufferToBigInt(this.raw[0][11]);
  extradata = () => this.raw[0][12];
  mixDigest = () => this.raw[0][13];
  blockNonce = () => this.raw[0][14];

  hasBody () {
    return this.raw.length > 1;
  }

  body () {
    return [this.raw[1], this.raw[2]];
  }

  hash (): Buffer {
    return keccak256(rlpEncode(this.header()));
  }

  powHash (): Buffer {
    return keccak256(rlpEncode(this.header().slice(0, -2)));
  }

  transactionHashes (): Buffer[] {
    return this.transactions().map(t => keccak256(rlpEncode(t.raw)));
  }
}