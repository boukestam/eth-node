import { rlpEncode } from "./rlp";
import { Storage, Trie } from "./trie";
import { bigIntToBuffer, bufferToBigInt } from "./util";

export class Account {

  address: Buffer;
  private raw: Buffer[];

  constructor (address: Buffer, raw: Buffer[]) {
    this.address = address;
    this.raw = raw;
  }

  nonce = () => bufferToBigInt(this.raw[0]);
  balance = () => bufferToBigInt(this.raw[1]);
  storageRoot = () => this.raw[2];
  codeHash = () => this.raw[3];

  storageTrie = (db: Storage) => new Trie(db, this.storageRoot());
  code = async (db: Storage) => await db.get(this.codeHash());

  setBalance = (balance: bigint) => this.raw[1] = bigIntToBuffer(balance);

  serialize = () => rlpEncode([this.raw]);
}