import { Account } from "./account";
import { rlpDecode, rlpEncode } from "./rlp";
import { Trie } from "./trie";
import { bigIntToBuffer } from "./util";
import { Storage } from "./trie";

export class WorldState {

  trie: Trie;

  constructor (db: Storage, root?: Buffer) {
    this.trie = new Trie(db, root);
  }

  async createAccount (address: Buffer, nonce: bigint, balance: bigint, storageRoot: Buffer, codeHash: Buffer): Promise<Account> {
    const account = new Account(address, [
      bigIntToBuffer(nonce),
      bigIntToBuffer(balance),
      storageRoot,
      codeHash
    ]);

    await this.trie.put(address, account.serialize());

    return account;
  }

  async getAccount (address: Buffer): Promise<Account> {
    const data = await this.trie.get(address);
    let raw;

    if (data.length === 0) {
      raw = [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)]
    } else {
      raw = rlpDecode(data);
    }

    return new Account(address, raw);
  }

  async setAccountBalance (account: Account, balance: bigint) {
    account.setBalance(balance);
    await this.trie.put(account.address, account.serialize());
  }

  async setAccountBalance (account: Account, balance: bigint) {
    account.setBalance(balance);
    await this.trie.put(account.address, account.serialize());
  }
}