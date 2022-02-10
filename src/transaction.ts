import { ecdsaRecover, publicKeyConvert } from "secp256k1";
import { rlpEncode } from "./rlp";
import { bufferToBigInt, keccak256, pkToAddress, zfill } from "./util";

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

  publicKey = () => Buffer.from(
    publicKeyConvert(
      ecdsaRecover(
        Buffer.concat([zfill(this.raw[7], 32), zfill(this.raw[8], 32)]), 
        this.raw[6][0] - 27, 
        keccak256(rlpEncode(this.raw.slice(0, 6)))
      ),
      false
    ).slice(1)
  )
  origin = () => pkToAddress(this.publicKey());


  hash () {
    return keccak256(rlpEncode(this.raw));
  }
}