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

  increaseNonce = () => this.raw[0] = bigIntToBuffer(this.nonce() + 1n);
  setBalance = (balance: bigint) => this.raw[1] = bigIntToBuffer(balance);
  setStorageRoot = (root: Buffer) => this.raw[2] = root;

  serialize = () => this.raw;
}