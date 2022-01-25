import { bufferToBigInt, bufferToInt, keccak256 } from "./util";
import * as rlp from 'rlp';

interface BlockHeader {
  parentHash: Buffer;
  ommersHash: Buffer;
  coinbase: Buffer;
  stateRoot: Buffer;
  txsRoot: Buffer;
  receiptsRoot: Buffer;
  bloom: Buffer;
  difficulty: BigInt;
  number: number;
  gasLimit: BigInt;
  gasUsed: BigInt;
  time: BigInt;
  extradata: Buffer;
  mixDigest: Buffer;
  blockNonce: Buffer;
}

export class Block {

  static HEADER_SIZE = 550;

  raw: any[];

  constructor (raw: any[]) {
    this.raw = raw;
  }

  header () {
    return this.raw[0];
  }

  parsedHeader (): BlockHeader {
    const [
      parentHash,
      ommersHash,
      coinbase,
      stateRoot,
      txsRoot,
      receiptsRoot,
      bloom,
      difficulty,
      number,
      gasLimit,
      gasUsed,
      time,
      extradata,
      mixDigest,
      blockNonce
    ] = this.header();

    return {
      parentHash,
      ommersHash,
      coinbase,
      stateRoot,
      txsRoot,
      receiptsRoot,
      bloom,
      difficulty: bufferToBigInt(difficulty),
      number: bufferToInt(number),
      gasLimit: bufferToBigInt(gasLimit),
      gasUsed: bufferToBigInt(gasUsed),
      time: bufferToBigInt(time),
      extradata,
      mixDigest,
      blockNonce
    };
  }

  hasBody () {
    return this.raw.length > 1;
  }

  body () {
    return [this.raw[1], this.raw[2]];
  }

  hash () {
    return keccak256(rlp.encode(this.header()));
  }

  transactionHashes (): Buffer[] {
    return this.body()[0].map(raw => keccak256(rlp.encode(raw)));
  }
}