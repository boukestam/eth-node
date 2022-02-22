import { Account } from "./account";
import { rlpDecode, rlpEncode } from "./rlp";
import { Trie } from "./trie";
import { bigIntToBuffer, keccak256, keccak256Array, zfill } from "./util";
import { Storage } from "./trie";

export class WorldState {

  db: Storage;
  trie: Trie;

  constructor (db: Storage, root?: Buffer) {
    this.db = db;
    this.trie = new Trie(db, root);
  }

  createAccount (address: Buffer, nonce: bigint, balance: bigint, storageRoot: Buffer, codeHash: Buffer): Account {
    return new Account(address, [
      bigIntToBuffer(nonce),
      bigIntToBuffer(balance),
      storageRoot,
      codeHash
    ]);
  }

  async getAccount (address: Buffer): Promise<Account> {
    const data = await this.trie.get(keccak256(address));
    let raw;

    if (data.length === 0) {
      raw = [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)]
    } else {
      raw = rlpDecode(data);
    }

    return new Account(address, raw);
  }

  async putAccount (account: Account) {
    await this.trie.put(keccak256(account.address), rlpEncode(account.serialize()));
  }

  static getStorageKey (address: Buffer, position: bigint): Buffer {
    return keccak256Array([zfill(address, 32), zfill(bigIntToBuffer(position), 32)]);
  }

  async getStorageAt (account: Account, position: bigint): Promise<Buffer> {
    const key = WorldState.getStorageKey(account.address, position);
    const trie = account.storageTrie(this.db);
    return await trie.get(key);
  }

  async putStorageAt (account: Account, position: bigint, value: Buffer) {
    const key = WorldState.getStorageKey(account.address, position);
    const trie = account.storageTrie(this.db);
    await trie.put(key, value);
    account.setStorageRoot(trie.root);
  }
}